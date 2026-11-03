"use client";

import Link from "next/link";
import { Crown, Pause, Timer } from "lucide-react";
import { useAccess } from "@/lib/hooks/use-access";
import { cn, formatDuration } from "@/lib/utils";

/**
 * Contador regressivo do tempo diário (canto superior esquerdo do painel).
 * Gratuito: 1 hora. Plano Básico: 10 horas. Avançado, Anual e proprietário: sem limite.
 */
export function FreeTimer({ className }: { className?: string }) {
  const { ready, unlimited, remaining, status, usage, idle } = useAccess();

  if (!ready) return <span className={cn("skeleton h-9 w-40 rounded-xl", className)} aria-hidden />;

  if (unlimited) {
    const plan = status?.is_admin ? "Proprietário" : status?.subscription?.status === "ativa" ? status.subscription.plan_name : "Plano ativo";
    return (
      <Link
        href="/app/meu-plano"
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-xl bg-income-soft px-3 text-[13px] font-semibold text-income ring-1 ring-income/20",
          className,
        )}
      >
        <Crown className="size-4" />
        <span className="max-sm:hidden">{plan} · sem limite</span>
        <span className="sm:hidden">Sem limite</span>
      </Link>
    );
  }

  const planLimited = usage?.scope === "plano";
  const label = planLimited ? `${(usage?.plan_name ?? "Plano").replace(/^Plano\s+/i, "")} hoje` : "Grátis hoje";
  const secs = remaining ?? 0;
  const tone = idle ? "idle" : secs <= 300 ? "danger" : secs <= 900 ? "warn" : "brand";
  return (
    <Link
      href={planLimited ? "/app/meu-plano" : "/planos"}
      title={
        idle
          ? "Contador pausado por inatividade. Toque ou mexa o mouse para continuar."
          : `Tempo de uso restante hoje (renova à meia-noite, horário de Brasília)`
      }
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-xl px-3 ring-1 transition",
        tone === "brand" && "bg-brand-50 text-brand-700 ring-brand-100 hover:bg-brand-100",
        tone === "warn" && "bg-warn-soft text-warn ring-warn/25",
        tone === "danger" && "animate-pulse bg-expense-soft text-expense ring-expense/25",
        tone === "idle" && "bg-surface text-muted ring-line",
        className,
      )}
    >
      {idle ? <Pause className="size-4 shrink-0" /> : <Timer className="size-4 shrink-0" />}
      <span className="text-[11px] font-semibold uppercase tracking-wide opacity-75 max-sm:hidden">{idle ? "Pausado" : label}</span>
      <span className="font-mono text-[15px] font-bold tabular-nums">{formatDuration(secs)}</span>
    </Link>
  );
}
