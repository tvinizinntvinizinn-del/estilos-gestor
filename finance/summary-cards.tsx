"use client";

import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react";
import { CountUp } from "@/components/ui/count-up";
import { cn, formatBRL } from "@/lib/utils";

/** Totais do período: entradas, saídas e saldo. */
export function SummaryCards({ entradas, saidas, loading }: { entradas: number; saidas: number; loading?: boolean }) {
  const saldo = entradas - saidas;
  const items = [
    { label: "Total de entradas", value: entradas, icon: <ArrowUpRight />, cls: "bg-income-soft text-income", accent: "from-income/70" },
    { label: "Total de saídas", value: saidas, icon: <ArrowDownRight />, cls: "bg-expense-soft text-expense", accent: "from-expense/70" },
    {
      label: "Saldo do período",
      value: saldo,
      icon: <Scale />,
      cls: saldo >= 0 ? "bg-brand-50 text-brand-600" : "bg-expense-soft text-expense",
      accent: "from-brand-500/70",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.label} className="relative overflow-hidden rounded-2xl border border-line/80 bg-white p-5 shadow-soft">
          <span className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r to-transparent", it.accent)} aria-hidden />
          <div className="flex items-center gap-3">
            <span className={cn("grid size-10 place-items-center rounded-xl [&_svg]:size-5", it.cls)}>{it.icon}</span>
            <p className="text-sm font-medium text-muted">{it.label}</p>
          </div>
          <p className="mt-3 text-2xl font-extrabold tracking-tight tabular-nums text-ink">
            {loading ? <span className="skeleton inline-block h-7 w-32 rounded-lg" /> : <CountUp value={it.value} format={formatBRL} duration={800} />}
          </p>
        </div>
      ))}
    </div>
  );
}
