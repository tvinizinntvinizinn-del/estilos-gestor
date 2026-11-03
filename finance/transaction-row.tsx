import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { Transaction } from "@/lib/data";
import { cn, formatBRL, formatDateTime } from "@/lib/utils";

/** Linha de movimentação: sinal +/− e seta acompanham a cor (não depende só de cor). */
export function TransactionRow({ t, actions, compact }: { t: Transaction; actions?: ReactNode; compact?: boolean }) {
  const income = t.type === "entrada";
  return (
    <div className={cn("flex items-center gap-3", compact ? "py-2.5" : "py-3.5")}>
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          income ? "bg-income-soft text-income" : "bg-expense-soft text-expense",
        )}
        aria-hidden
      >
        {income ? <ArrowUpRight className="size-5" /> : <ArrowDownRight className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold text-ink">{t.description}</p>
        <p className="truncate text-[12.5px] text-muted">
          {t.category} · {formatDateTime(t.occurred_at)}
          {t.sale_id && <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-px text-[11px] font-semibold text-brand-700">Venda</span>}
        </p>
      </div>
      <p className={cn("shrink-0 text-right text-[15px] font-bold tabular-nums", income ? "text-income" : "text-expense")}>
        <span className="sr-only">{income ? "Entrada de" : "Saída de"} </span>
        {income ? "+" : "−"} {formatBRL(t.amount)}
      </p>
      {actions}
    </div>
  );
}
