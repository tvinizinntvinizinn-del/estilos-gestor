/**
 * Notificações no celular e no computador (Web Push) — lado do navegador.
 * A permissão só é pedida quando o usuário clica em "Ativar notificações".
 */
import { vapidPublicKey } from "./config";
import { AppError } from "./data/errors";

export interface PushEnvironment {
  /** Navegador tem Service Worker + Push + Notification */
  supported: boolean;
  isIOS: boolean;
  /** Aberto como app instalado (tela inicial) */
  standalone: boolean;
  /** iPhone/iPad fora da Tela de Início: o iOS só permite push em apps adicionados à Tela de Início (iOS 16.4+) */
  needsHomeScreen: boolean;
  permission: NotificationPermission | "unsupported";
  secure: boolean;
}

export function getPushEnvironment(): PushEnvironment {
  if (typeof window === "undefined") {
    return { supported: false, isIOS: false, standalone: false, needsHomeScreen: false, permission: "unsupported", secure: false };
  }
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return {
    supported,
    isIOS,
    standalone,
    needsHomeScreen: isIOS && !standalone,
    permission: "Notification" in window ? Notification.permission : "unsupported",
    secure: window.isSecureContext,
  };
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  return navigator.serviceWorker.ready;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!getPushEnvironment().supported) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

function toKeys(sub: PushSubscription) {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new AppError("PUSH_NAO_SUPORTADO");
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}

/** Pede permissão (somente após clique), inscreve o aparelho e devolve as chaves para salvar no servidor. */
export async function subscribeThisDevice() {
  const env = getPushEnvironment();
  if (!vapidPublicKey) throw new AppError("PUSH_INDISPONIVEL");
  if (!env.supported || !env.secure) throw new AppError("PUSH_NAO_SUPORTADO");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new AppError("PUSH_NEGADO");

  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  // Chave do servidor mudou? Refaz a inscrição.
  const key = sub?.options?.applicationServerKey;
  if (sub && key && btoa(String.fromCharCode(...new Uint8Array(key))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== vapidPublicKey) {
    await sub.unsubscribe().catch(() => undefined);
    sub = null;
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
  }
  return toKeys(sub);
}

export async function unsubscribeThisDevice(): Promise<string | null> {
  const sub = await currentPushSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  return endpoint;
}

/** Nome amigável do aparelho a partir do navegador */
export function deviceLabel(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Aparelho";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${os} · ${browser}`;
}
