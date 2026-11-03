"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { BellOff, BellRing, CircleCheck, Crown, Info, Lock, MonitorSmartphone, Send, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { backend, friendlyError, isDemo } from "@/lib/data";
import { useAccess } from "@/lib/hooks/use-access";
import { useLoad } from "@/lib/hooks/use-load";
import { usePush } from "@/lib/hooks/use-push";
import { deviceLabel } from "@/lib/push";
import { cn, relativeTime } from "@/lib/utils";

const DISMISS_KEY = "eg-push-prompt-dispensado";

function IOSSteps({ dark = false }: { dark?: boolean }) {
  return (
    <ol className={cn("space-y-2 text-[13.5px]", dark ? "text-white/80" : "text-ink/80")}>
      <li className="flex items-start gap-2">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">1</span>
        <span>
          Abra o site no <strong>Safari</strong> e toque em <Share className="inline size-4 align-[-3px]" /> <strong>Compartilhar</strong>.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">2</span>
        <span>
          Escolha <SquarePlus className="inline size-4 align-[-3px]" /> <strong>Adicionar à Tela de Início</strong>.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">3</span>
        <span>
          Abra o <strong>Estilos Gestor</strong> pelo ícone e toque em <strong>Ativar notificações</strong> (iOS 16.4 ou mais recente).
        </span>
      </li>
    </ol>
  );
}

/** Cartão compacto no painel: aparece até o usuário ativar ou dispensar. */
export function PushPrompt() {
  const toast = useToast();
  const { ready, entitlements } = useAccess();
  const push = usePush(entitlements.push);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* armazenamento indisponível */
    }
  };

  const env = push.env;
  const hidden =
    !ready || !push.checked || dismissed || push.subscribed || !env || env.permission === "denied" || (!env.supported && !env.needsHomeScreen);

  const enable = async () => {
    try {
      await push.enable();
      toast.success("Notificações ativadas", "Você vai receber os alertas neste aparelho.");
    } catch (e) {
      toast.error("Não foi possível ativar", friendlyError(e));
    }
  };

  return (
    <AnimatePresence>
      {!hidden && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          className="relative mt-6 overflow-hidden rounded-2xl bg-white p-5 shadow-soft ring-1 ring-line sm:p-6"
          aria-label="Notificações no aparelho"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-brand-500/10 blur-2xl" aria-hidden />
          <button onClick={dismiss} className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg text-muted hover:bg-surface" aria-label="Dispensar">
            <X className="size-4" />
          </button>
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-b from-brand-500 to-brand-700 text-white shadow-[0_8px_20px_-8px_rgb(37_99_235/0.8)]">
              <BellRing className="size-6" />
            </span>
            <div className="min-w-0 flex-1 pr-6">
              <h2 className="font-semibold text-ink">Receba os alertas no celular e no computador</h2>
              {entitlements.push ? (
                env?.needsHomeScreen ? (
                  <div className="mt-2">
                    <p className="mb-2 text-sm text-muted">No iPhone, as notificações funcionam com o site adicionado à Tela de Início:</p>
                    <IOSSteps />
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted">Estoque baixo, vendas, vencimento do plano e lembretes — mesmo com o site fechado.</p>
                )
              ) : (
                <p className="mt-1 text-sm text-muted">
                  Disponível nos planos pagos. No plano gratuito, os alertas continuam aparecendo no sino <BellRing className="inline size-3.5" /> do painel.
                </p>
              )}
            </div>
            {entitlements.push ? (
              !env?.needsHomeScreen && (
                <Button onClick={enable} loading={push.busy} className="shrink-0">
                  <BellRing /> Ativar notificações
                </Button>
              )
            ) : (
              <Link href="/planos" className={cn(buttonVariants({ variant: "secondary" }), "shrink-0")}>
                <Crown /> Ver planos
              </Link>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

/** Cartão completo em Configurações: ativar, desativar, testar, aparelhos e categorias. */
export function PushSettingsCard() {
  const toast = useToast();
  const { ready, entitlements } = useAccess();
  const push = usePush(entitlements.push);
  const devices = useLoad(() => (entitlements.push && backend.pushAvailable ? backend.listPushDevices() : Promise.resolve([])), [entitlements.push, push.subscribed]);
  const env = push.env;

  const run = async (fn: () => Promise<unknown>, ok: string, okDetail?: string) => {
    try {
      await fn();
      toast.success(ok, okDetail);
      void devices.reload();
    } catch (e) {
      toast.error("Não foi possível concluir", friendlyError(e));
    }
  };

  let state: { tone: "success" | "warn" | "neutral" | "danger"; label: string };
  if (!env || !ready) state = { tone: "neutral", label: "Verificando…" };
  else if (push.subscribed) state = { tone: "success", label: "Ativadas neste aparelho" };
  else if (env.permission === "denied") state = { tone: "danger", label: "Bloqueadas no navegador" };
  else if (env.needsHomeScreen) state = { tone: "warn", label: "Adicione à Tela de Início" };
  else if (!env.supported) state = { tone: "neutral", label: "Não suportadas neste navegador" };
  else state = { tone: "neutral", label: "Desativadas neste aparelho" };

  return (
    <Card id="notificacoes" className="scroll-mt-24">
      <CardHeader
        icon={<MonitorSmartphone />}
        title="Notificações no celular e no computador"
        description="Receba os alertas mesmo com o site fechado (quando o aparelho e o navegador permitem)."
        action={<Badge tone={state.tone}>{state.label}</Badge>}
      />
      <CardBody className="space-y-4">
        {!entitlements.push ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line sm:flex-row sm:items-center">
            <Lock className="size-5 shrink-0 text-muted" />
            <p className="flex-1 text-sm text-muted">
              Notificações no aparelho estão incluídas nos planos <strong className="text-ink">Básico, Avançado e Completo</strong>. No plano gratuito, os alertas continuam no sino do painel.
            </p>
            <Link href="/planos" className={buttonVariants({ size: "sm" })}>
              <Crown /> Ver planos
            </Link>
          </div>
        ) : env?.needsHomeScreen ? (
          <div className="rounded-2xl bg-brand-50/60 p-4 ring-1 ring-brand-100">
            <p className="mb-3 text-sm font-semibold text-ink">No iPhone e no iPad</p>
            <IOSSteps />
          </div>
        ) : env?.permission === "denied" ? (
          <div className="flex items-start gap-3 rounded-2xl bg-expense-soft p-4 text-sm text-expense ring-1 ring-expense/20">
            <BellOff className="mt-0.5 size-5 shrink-0" />
            <p>
              As notificações foram bloqueadas para este site. Toque no cadeado ao lado do endereço do site, permita <strong>Notificações</strong> e recarregue a página.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {push.subscribed ? (
              <>
                <Button variant="secondary" onClick={() => run(push.test, "Notificação de teste enviada", "Ela deve aparecer em alguns segundos.")} loading={push.busy}>
                  <Send /> Enviar teste
                </Button>
                <Button variant="ghost" onClick={() => run(push.disable, "Notificações desativadas neste aparelho")} disabled={push.busy}>
                  <BellOff /> Desativar neste aparelho
                </Button>
              </>
            ) : (
              <Button onClick={() => run(push.enable, "Notificações ativadas", "Você vai receber os alertas neste aparelho.")} loading={push.busy} disabled={!env?.supported}>
                <BellRing /> Ativar notificações
              </Button>
            )}
          </div>
        )}

        {isDemo && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 ring-1 ring-amber-200">
            <Info className="mt-0.5 size-4 shrink-0" />
            Demonstração: o envio real para o aparelho só acontece na versão publicada, com o Supabase e as chaves de notificação configurados. Os alertas continuam no sino.
          </p>
        )}

        {entitlements.push && (devices.data?.length ?? 0) > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Aparelhos com notificações</p>
            <ul className="divide-y divide-line rounded-2xl ring-1 ring-line">
              {devices.data!.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <CircleCheck className="size-4 text-income" />
                  <span className="flex-1 font-medium">{deviceLabel(d.user_agent)}</span>
                  <span className="text-xs text-muted">{d.last_success_at ? `último aviso ${relativeTime(d.last_success_at)}` : `desde ${relativeTime(d.created_at)}`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
