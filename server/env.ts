/**
 * Variáveis de ambiente do SERVIDOR. Nenhuma delas tem prefixo NEXT_PUBLIC_,
 * então o Next.js nunca as inclui no código enviado ao navegador.
 */
import { createClient } from "@supabase/supabase-js";
import type { VapidKeys } from "./web-push";

if (typeof window !== "undefined") {
  throw new Error("lib/server/env só pode ser usado no servidor.");
}

export function pushServerConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const vapid: VapidKeys = {
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "",
  };
  const dispatchSecret = process.env.PUSH_DISPATCH_SECRET || process.env.CRON_SECRET || "";

  const missing = [
    !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
    !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
    !vapid.publicKey && "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    !vapid.privateKey && "VAPID_PRIVATE_KEY",
    !vapid.subject && "VAPID_SUBJECT",
  ].filter(Boolean) as string[];

  return { supabaseUrl, serviceRoleKey, vapid, dispatchSecret, missing };
}

/** Cliente com a chave service_role: ignora RLS. Usar SOMENTE nas rotas do servidor. */
export function supabaseAdmin(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
