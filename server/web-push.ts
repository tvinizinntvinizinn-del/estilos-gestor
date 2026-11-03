/**
 * Web Push sem dependências externas (somente o módulo crypto do Node).
 *  - Criptografia da mensagem: RFC 8291 (aes128gcm, RFC 8188)
 *  - Identificação do servidor: VAPID, RFC 8292 (JWT ES256)
 *
 * USO EXCLUSIVO NO SERVIDOR (rotas /api/push/*). A chave privada VAPID nunca vai para o navegador.
 */
import crypto from "node:crypto";

if (typeof window !== "undefined") {
  throw new Error("lib/server/web-push só pode ser usado no servidor.");
}

export interface PushTarget {
  endpoint: string;
  p256dh: string; // chave pública do navegador (base64url, 65 bytes)
  auth: string; // segredo de autenticação do navegador (base64url, 16 bytes)
}

export interface VapidKeys {
  subject: string; // "mailto:voce@dominio.com" ou "https://seu-site"
  publicKey: string; // base64url, 65 bytes (formato não comprimido)
  privateKey: string; // base64url, 32 bytes
}

export interface SendOptions {
  ttlSeconds?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  topic?: string;
  timeoutMs?: number;
}

export interface SendResult {
  ok: boolean;
  /** Inscrição não existe mais (404/410): deve ser removida */
  gone: boolean;
  /** Falha temporária (429/5xx/rede): pode tentar de novo */
  retry: boolean;
  status: number;
}

const b64u = (buf: Uint8Array) => Buffer.from(buf).toString("base64url");
const fromB64u = (s: string) => Buffer.from(s.trim().replace(/=+$/, ""), "base64url");

/** Mesma lista do banco: só serviços de push conhecidos (evita chamadas a endereços arbitrários). */
const ALLOWED_ENDPOINT =
  /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com|[a-z0-9.-]+\.push\.apple\.com)\//;

export function isAllowedPushEndpoint(endpoint: string) {
  return ALLOWED_ENDPOINT.test(endpoint);
}

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number) {
  const prk = crypto.createHmac("sha256", salt).update(ikm).digest();
  return crypto
    .createHmac("sha256", prk)
    .update(Buffer.concat([info, Buffer.from([1])]))
    .digest()
    .subarray(0, length);
}

/**
 * Criptografa a mensagem para um navegador (RFC 8291).
 * `testing` permite fixar a chave do servidor e o salt para conferir com o exemplo oficial da RFC.
 */
export function encryptPayload(target: Pick<PushTarget, "p256dh" | "auth">, plaintext: Buffer, testing?: { asPrivateKey: Buffer; salt: Buffer }) {
  const uaPublic = fromB64u(target.p256dh);
  const authSecret = fromB64u(target.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error("Chave p256dh inválida");
  if (authSecret.length < 16) throw new Error("Segredo auth inválido");

  const ecdh = crypto.createECDH("prime256v1");
  if (testing) ecdh.setPrivateKey(testing.asPrivateKey);
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, sharedSecret, keyInfo, 32);
  const salt = testing?.salt ?? crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);

  const recordSize = 4096;
  if (plaintext.length + 17 > recordSize) throw new Error("Mensagem grande demais para push");
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, encrypted]);
}

/** Cabeçalho Authorization VAPID (RFC 8292). O token vale no máximo 12 horas. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, nowSeconds = Math.floor(Date.now() / 1000)) {
  const audience = new URL(endpoint).origin;
  const header = b64u(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: audience, exp: nowSeconds + 12 * 3600, sub: keys.subject })));
  const unsigned = `${header}.${claims}`;

  const pub = fromB64u(keys.publicKey);
  let d = fromB64u(keys.privateKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY inválida");
  if (d.length < 32) d = Buffer.concat([Buffer.alloc(32 - d.length), d]);
  if (d.length !== 32) throw new Error("VAPID_PRIVATE_KEY inválida");

  const key = crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: "jwk",
  });
  const signature = crypto.sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64u(signature)}, k=${keys.publicKey}`;
}

/** Envia uma notificação para um aparelho. */
export async function sendWebPush(target: PushTarget, payload: string, keys: VapidKeys, opts: SendOptions = {}): Promise<SendResult> {
  if (!isAllowedPushEndpoint(target.endpoint)) return { ok: false, gone: true, retry: false, status: 0 };

  let body: Buffer;
  try {
    body = encryptPayload(target, Buffer.from(payload, "utf8"));
  } catch {
    return { ok: false, gone: true, retry: false, status: 0 }; // chaves corrompidas: descarta a inscrição
  }

  const headers: Record<string, string> = {
    Authorization: vapidAuthorization(target.endpoint, keys),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(Math.max(0, Math.floor(opts.ttlSeconds ?? 86_400))),
    Urgency: opts.urgency ?? "normal",
  };
  if (opts.topic) headers.Topic = opts.topic.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  try {
    const res = await fetch(target.endpoint, { method: "POST", headers, body: new Uint8Array(body), signal: controller.signal });
    const status = res.status;
    return {
      ok: status >= 200 && status < 300,
      gone: status === 404 || status === 410,
      retry: status === 429 || status >= 500,
      status,
    };
  } catch {
    return { ok: false, gone: false, retry: true, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}
