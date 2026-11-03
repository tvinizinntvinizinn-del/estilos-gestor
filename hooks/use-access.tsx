"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { HEARTBEAT_MS, IDLE_MS } from "../config";
import { backend, friendlyError, type AppSettings, type Entitlements, type MyStatus, type UsageState } from "../data";
import { on } from "../events";

/**
 * Controle de acesso do usuário logado:
 *  - assinatura vigente (plano) e se é administrador
 *  - contador do tempo diário (gratuito: 1h; Básico: 10h), SEMPRE calculado pelo servidor.
 *    O navegador só mostra a contagem regressiva entre um pulso e outro;
 *    a cada 20s (e ao voltar para a aba) o valor é corrigido pelo servidor.
 *  - o tempo só conta durante o USO ATIVO: aba visível e alguma interação
 *    (toque, mouse, teclado, rolagem) nos últimos 5 minutos.
 */
interface AccessState {
  status: MyStatus | null;
  settings: AppSettings | null;
  usage: UsageState | null;
  remaining: number | null; // segundos (null = ilimitado ou carregando)
  unlimited: boolean;
  blocked: boolean;
  /** Contador pausado por falta de interação */
  idle: boolean;
  /** O que o plano libera (lembretes, push, suporte prioritário, limite diário) */
  entitlements: Entitlements;
  ready: boolean;
  error: string | null;
  refreshStatus: () => Promise<void>;
  /** Garante um pulso recente antes de gravar (o servidor exige sessão ativa). */
  ensureAccess: () => Promise<void>;
}

const AccessContext = createContext<AccessState | null>(null);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MyStatus | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [usage, setUsage] = useState<UsageState | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [idle, setIdle] = useState(false);
  const lastActivity = useRef(Date.now());

  // Âncora da contagem local: segundos restantes no último pulso + momento do pulso
  const anchor = useRef<{ seconds: number; at: number } | null>(null);
  const lastBeat = useRef(0);
  const limitRef = useRef<number | null>(null);
  const beating = useRef<Promise<UsageState | null> | null>(null);

  const applyUsage = useCallback((u: UsageState) => {
    setUsage(u);
    limitRef.current = u.limit_seconds;
    if (u.unlimited || u.remaining_seconds == null) {
      anchor.current = null;
      setRemaining(null);
    } else {
      anchor.current = { seconds: u.remaining_seconds, at: Date.now() };
      setRemaining(u.remaining_seconds);
    }
  }, []);

  const beat = useCallback(async () => {
    if (beating.current) return beating.current;
    beating.current = (async () => {
      try {
        const u = await backend.heartbeat();
        lastBeat.current = Date.now();
        applyUsage(u);
        setError(null);
        return u;
      } catch (e) {
        setError(friendlyError(e));
        return null;
      } finally {
        beating.current = null;
      }
    })();
    return beating.current;
  }, [applyUsage]);

  const refreshStatus = useCallback(async () => {
    try {
      const [s, cfg] = await Promise.all([backend.getMyStatus(), backend.getSettings()]);
      setStatus(s);
      setSettings(cfg);
      await beat();
    } catch (e) {
      setError(friendlyError(e));
    }
  }, [beat]);

  // Carga inicial
  useEffect(() => {
    let alive = true;
    (async () => {
      await refreshStatus();
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [refreshStatus]);

  const freeze = useCallback(() => {
    if (anchor.current && Number.isFinite(anchor.current.at)) {
      const secs = Math.max(0, anchor.current.seconds - (Date.now() - anchor.current.at) / 1000);
      anchor.current = { seconds: secs, at: Number.POSITIVE_INFINITY };
    }
  }, []);

  // Uso ativo: qualquer interação reinicia o relógio de inatividade
  useEffect(() => {
    let last = 0;
    const onActivity = () => {
      const t = Date.now();
      if (t - last < 1000) return;
      last = t;
      lastActivity.current = t;
      setIdle((wasIdle) => {
        if (wasIdle) void beat(); // voltou a usar: confirma com o servidor e retoma a contagem
        return false;
      });
    };
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const check = window.setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_MS) {
        setIdle((wasIdle) => {
          if (!wasIdle) freeze();
          return true;
        });
      }
    }, 15_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(check);
    };
  }, [beat, freeze]);

  // Pulsos periódicos somente em uso ativo (aba visível e sem inatividade)
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastActivity.current <= IDLE_MS) void beat();
    }, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        lastActivity.current = Date.now();
        setIdle(false);
        void beat();
      } else {
        // Congela a contagem local enquanto a aba estiver oculta
        freeze();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [beat, freeze]);

  // Contagem regressiva visual (1s)
  useEffect(() => {
    const id = window.setInterval(() => {
      const a = anchor.current;
      if (!a || document.visibilityState !== "visible" || !Number.isFinite(a.at)) return;
      const secs = Math.max(0, Math.round(a.seconds - (Date.now() - a.at) / 1000));
      setRemaining(secs);
      if (secs === 0) void beat(); // confirma com o servidor
    }, 1000);
    return () => window.clearInterval(id);
  }, [beat]);

  // Outro aparelho usou tempo: sincroniza em tempo real
  useEffect(
    () =>
      backend.subscribeUsage((secondsUsed) => {
        const limit = limitRef.current;
        if (limit == null) return;
        const secs = Math.max(0, limit - secondsUsed);
        if (!anchor.current || secs < anchor.current.seconds - (Date.now() - anchor.current.at) / 1000) {
          anchor.current = { seconds: secs, at: Date.now() };
          setRemaining(secs);
        }
      }),
    [],
  );

  // Renovação à meia-noite (Brasília)
  useEffect(() => {
    if (!usage?.resets_at) return;
    const ms = new Date(usage.resets_at).getTime() - Date.now() + 2000;
    if (ms <= 0 || ms > 26 * 3_600_000) return;
    const id = window.setTimeout(() => void beat(), ms);
    return () => window.clearTimeout(id);
  }, [usage?.resets_at, beat]);

  // Plano ativado/alterado pelo administrador -> atualiza status
  useEffect(() => on(["status"], () => void refreshStatus()), [refreshStatus]);
  useEffect(
    () =>
      backend.subscribeNotifications(() => {
        void refreshStatus();
      }),
    [refreshStatus],
  );

  const ensureAccess = useCallback(async () => {
    lastActivity.current = Date.now();
    if (usage?.unlimited) return;
    if (Date.now() - lastBeat.current > HEARTBEAT_MS + 5000) await beat();
  }, [usage?.unlimited, beat]);

  const unlimited = Boolean(usage?.unlimited);
  const blocked = ready && !unlimited && remaining !== null && remaining <= 0;
  const entitlements = useMemo<Entitlements>(
    () =>
      status?.entitlements ?? {
        plan_id: null,
        plan_name: "Gratuito",
        daily_limit_seconds: usage?.limit_seconds ?? null,
        push: false,
        reminders: false,
        priority_support: false,
      },
    [status?.entitlements, usage?.limit_seconds],
  );

  const value = useMemo<AccessState>(
    () => ({ status, settings, usage, remaining, unlimited, blocked, idle, entitlements, ready, error, refreshStatus, ensureAccess }),
    [status, settings, usage, remaining, unlimited, blocked, idle, entitlements, ready, error, refreshStatus, ensureAccess],
  );
  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess precisa estar dentro de <AccessProvider>");
  return ctx;
}
