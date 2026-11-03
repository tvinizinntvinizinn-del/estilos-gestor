"use client";

import { useCallback, useEffect, useState } from "react";
import { AppError, backend, isDemo } from "../data";
import { currentPushSubscription, getPushEnvironment, subscribeThisDevice, unsubscribeThisDevice, type PushEnvironment } from "../push";

/**
 * Estado das notificações neste aparelho.
 * `allowed` = o plano do usuário inclui notificações no aparelho (verificado também no servidor).
 */
export function usePush(allowed: boolean) {
  const [env, setEnv] = useState<PushEnvironment | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    const e = getPushEnvironment();
    setEnv(e);
    const sub = await currentPushSubscription().catch(() => null);
    setSubscribed(Boolean(sub) && e.permission === "granted");
    setChecked(true);
    return sub;
  }, []);

  // Ao abrir o app: se este aparelho já está inscrito, confirma a inscrição no servidor
  // (cobre troca de conta no mesmo navegador e renovação da inscrição pelo navegador).
  useEffect(() => {
    let alive = true;
    (async () => {
      const sub = await refresh();
      if (!alive || !sub || !allowed || !backend.pushAvailable || Notification.permission !== "granted") return;
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
        await backend.savePushSubscription({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }, navigator.userAgent).catch(() => undefined);
      }
    })();
    return () => {
      alive = false;
    };
  }, [allowed, refresh]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      if (!backend.pushAvailable) throw new AppError(isDemo ? "PUSH_INDISPONIVEL_DEMO" : "PUSH_INDISPONIVEL");
      const keys = await subscribeThisDevice();
      await backend.savePushSubscription(keys, navigator.userAgent);
      setSubscribed(true);
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [refresh]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const endpoint = await unsubscribeThisDevice();
      if (endpoint) await backend.removePushSubscription(endpoint).catch(() => undefined);
      setSubscribed(false);
    } finally {
      setBusy(false);
      void refresh();
    }
  }, [refresh]);

  const test = useCallback(async () => {
    setBusy(true);
    try {
      return await backend.sendTestPush();
    } finally {
      setBusy(false);
    }
  }, []);

  return { env, checked, subscribed, busy, enable, disable, test, available: backend.pushAvailable };
}
