"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { BadgePercent, Check, Crown, Infinity as InfinityIcon, Sparkles, Star, Timer } from "lucide-react";
import { WhatsAppIcon } from "@/components/brand/social-icons";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Plan } from "@/lib/data";
import { cn, formatBRL, formatBRLShort } from "@/lib/utils";
import { planWhatsappMessage, whatsappLink } from "@/lib/whatsapp";

/** Plano usado para calcular a economia (ex.: Anual comparado ao Avançado mensal). */
export function comparePlanFor(plan: Plan, plans: Plan[]) {
  return plan.compare_to_plan_id ? plans.find((p) => p.id === plan.compare_to_plan_id) ?? null : null;
}

function hoursLabel(seconds: number) {
  const h = Math.round((seconds / 3600) * 10) / 10;
  return `${h.toLocaleString("pt-BR")} ${h === 1 ? "hora" : "horas"}`;
}

export function PlanCard({
  plan,
  index = 0,
  whatsappNumber,
  email,
  mode = "whatsapp",
  current = false,
  tone = "dark",
  comparePlan = null,
}: {
  plan: Plan;
  index?: number;
  whatsappNumber: string | null;
  email?: string | null;
  /** "signup" para visitantes (leva ao cadastro); "whatsapp" para usuários logados */
  mode?: "whatsapp" | "signup";
  current?: boolean;
  tone?: "dark" | "light";
  comparePlan?: Plan | null;
}) {
  const featured = plan.featured;
  const annual = plan.billing_period === "anual" || plan.duration_months >= 12;
  const promo = !featured && Boolean(plan.highlight) && annual;
  const perMonth = plan.duration_months > 1 ? plan.price / plan.duration_months : null;
  const savings = comparePlan ? comparePlan.price * (plan.duration_months / Math.max(comparePlan.duration_months, 1)) - plan.price : 0;
  const link = whatsappLink(whatsappNumber, planWhatsappMessage(plan, email));
  const dark = tone === "dark";

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative flex flex-col rounded-3xl p-6 sm:p-7",
        dark
          ? featured
            ? "bg-gradient-to-b from-brand-600/30 to-navy-800/60 shadow-glow ring-2 ring-brand-500"
            : promo
              ? "bg-gradient-to-b from-amber-300/[0.09] to-white/[0.05] ring-1 ring-amber-300/40 backdrop-blur"
              : "bg-white/[0.06] ring-1 ring-white/12 backdrop-blur"
          : featured
            ? "bg-white shadow-glow ring-2 ring-brand-500"
            : promo
              ? "bg-gradient-to-b from-amber-50 to-white shadow-soft ring-1 ring-amber-300"
              : "bg-white shadow-soft ring-1 ring-line",
      )}
    >
      {plan.highlight && (
        <span
          className={cn(
            "absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold shadow-lg",
            featured ? "bg-brand-600 text-white" : "bg-gradient-to-r from-amber-300 to-amber-400 text-amber-950",
          )}
        >
          {featured ? <Star className="size-3.5 fill-current" /> : promo ? <BadgePercent className="size-3.5" /> : <Sparkles className="size-3.5" />} {plan.highlight}
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <h3 className={cn("text-lg font-bold", dark ? "text-white" : "text-ink")}>{plan.name}</h3>
        {current && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-income px-2.5 py-0.5 text-xs font-bold text-white">
            <Crown className="size-3" /> Seu plano
          </span>
        )}
      </div>
      <p className={cn("mt-1 text-sm", dark ? "text-white/60" : "text-muted")}>{plan.description}</p>

      <div className="mt-6 flex items-end gap-1.5">
        <span className={cn("text-4xl font-extrabold tracking-tight tabular-nums", dark ? "text-white" : "text-ink")}>{formatBRL(plan.price)}</span>
        <span className={cn("pb-1.5 text-sm font-medium", dark ? "text-white/60" : "text-muted")}>
          /{annual ? "ano" : plan.duration_months > 1 ? `${plan.duration_months} meses` : "mês"}
        </span>
      </div>

      {promo && perMonth ? (
        <div className={cn("mt-3 rounded-2xl p-3.5 ring-1", dark ? "bg-amber-300/10 ring-amber-300/25" : "bg-amber-100/60 ring-amber-200")}>
          <p className={cn("text-[15px] font-bold", dark ? "text-amber-200" : "text-amber-800")}>Equivalente a {formatBRLShort(perMonth)} por mês.</p>
          {savings > 0 && comparePlan && (
            <p className={cn("mt-1 text-[13px] font-medium", dark ? "text-amber-100/85" : "text-amber-900/80")}>
              Economize {formatBRLShort(savings)} por ano em comparação ao plano {comparePlan.name.replace(/^Plano\s+/i, "")} mensal.
            </p>
          )}
          <p className={cn("mt-1.5 text-[12px]", dark ? "text-white/55" : "text-muted")}>Pagamento anual de {formatBRLShort(plan.price)} à vista.</p>
        </div>
      ) : perMonth ? (
        <p className={cn("mt-1 text-[13px] font-medium", dark ? "text-brand-400" : "text-brand-600")}>Equivale a {formatBRL(perMonth)} por mês</p>
      ) : null}

      <p
        className={cn(
          "mt-4 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
          plan.daily_limit_seconds == null
            ? dark
              ? "bg-emerald-400/15 text-emerald-300"
              : "bg-income-soft text-income"
            : dark
              ? "bg-white/10 text-white/75"
              : "bg-surface text-muted ring-1 ring-line",
        )}
      >
        {plan.daily_limit_seconds == null ? (
          <>
            <InfinityIcon className="size-3.5" /> Uso ilimitado
          </>
        ) : (
          <>
            <Timer className="size-3.5" /> Até {hoursLabel(plan.daily_limit_seconds)} por dia
          </>
        )}
      </p>

      <ul className="mt-5 flex-1 space-y-2.5">
        {plan.features.map((f) => (
          <li key={f} className={cn("flex items-start gap-2.5 text-[14.5px] leading-snug", dark ? "text-white/85" : "text-ink")}>
            <span className={cn("mt-px grid size-5 shrink-0 place-items-center rounded-full", dark ? "bg-income/20 text-emerald-400" : "bg-income-soft text-income")}>
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-7">
        {mode === "signup" ? (
          <Link
            href={`/cadastro?plano=${plan.id}`}
            className={cn(buttonVariants({ variant: featured ? "primary" : dark ? "glass" : "secondary", size: "lg" }), "w-full")}
          >
            Começar agora
          </Link>
        ) : link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "whatsapp", size: "lg" }), "w-full")}>
            <WhatsAppIcon /> Assinar pelo WhatsApp
          </a>
        ) : (
          <>
            <Button variant="whatsapp" size="lg" className="w-full" disabled>
              <WhatsAppIcon /> Assinar pelo WhatsApp
            </Button>
            <p className={cn("mt-2 text-center text-xs", dark ? "text-white/50" : "text-muted")}>O número do WhatsApp ainda não foi configurado pelo administrador.</p>
          </>
        )}
      </div>
    </motion.article>
  );
}
