"use client";

import { useEffect, useState } from "react";
import { siteConfig } from "../config";
import { backend, type AppSettings } from "../data";
import { on } from "../events";

/**
 * Configurações públicas (WhatsApp, Instagram, e-mail de suporte), carregadas uma vez
 * e compartilhadas entre rodapé, planos e suporte. Atualiza quando o admin salva.
 */
let cache: AppSettings | null = null;
let inflight: Promise<AppSettings> | null = null;
const listeners = new Set<(s: AppSettings) => void>();

function fetchSettings(force = false) {
  if (!force && cache) return Promise.resolve(cache);
  if (!force && inflight) return inflight;
  inflight = backend
    .getSettings()
    .then((s) => {
      cache = s;
      listeners.forEach((fn) => fn(s));
      return s;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

if (typeof window !== "undefined") on(["settings"], () => void fetchSettings(true).catch(() => undefined));

export function usePublicSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(cache);
  useEffect(() => {
    listeners.add(setSettings);
    fetchSettings().then(setSettings).catch(() => undefined);
    return () => {
      listeners.delete(setSettings);
    };
  }, []);
  return {
    settings,
    whatsappNumber: settings ? settings.whatsapp_number : siteConfig.whatsappNumber,
    instagramUrl: settings?.instagram_url ?? null,
    supportEmail: settings?.support_email || siteConfig.supportEmail || null,
  };
}
