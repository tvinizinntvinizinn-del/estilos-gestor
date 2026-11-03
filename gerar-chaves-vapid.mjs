// Gera as chaves das notificações push (VAPID) e um segredo para o agendamento.
// Uso:  npm run push:chaves
// Copie a saída para a Vercel (Settings > Environment Variables) e para o seu .env.local.
// A chave PRIVADA e o segredo nunca devem ser publicados nem colocados em variáveis NEXT_PUBLIC_.
import crypto from "node:crypto";

const ecdh = crypto.createECDH("prime256v1");
ecdh.generateKeys();
const pub = ecdh.getPublicKey().toString("base64url");
let priv = ecdh.getPrivateKey();
if (priv.length < 32) priv = Buffer.concat([Buffer.alloc(32 - priv.length), priv]);

console.log(`
# ---- Notificações push (Estilos Gestor) ----
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${pub}
VAPID_PRIVATE_KEY=${priv.toString("base64url")}
VAPID_SUBJECT=mailto:seu-email@exemplo.com
PUSH_DISPATCH_SECRET=${crypto.randomBytes(32).toString("base64url")}
`);
