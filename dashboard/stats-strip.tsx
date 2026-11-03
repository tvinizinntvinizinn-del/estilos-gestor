"use client";

import { motion } from "motion/react";
import { Package, ShoppingCart, Smile, TriangleAlert, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { CountUp } from "@/components/ui/count-up";
import { cn, formatBRL } from "@/lib/utils";

export interface StripStats {
  satisfiedClients: number;
  satisfiedIsDemo: boolean;
  monthBalance: number;
  monthSales: number;
  products: number;
  lowStock: number;
}

function Item({
  icon,
  iconClass,
  label,
  children,
  note,
  index,
  className,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  children: ReactNode;
  note?: ReactNode;
  index: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.06 }}
      className={cn("flex min-w-0 items-center gap-3.5 bg-white px-4 py-4 sm:px-5 lg:flex-col lg:items-start lg:gap-3 lg:py-5", className)}
    >
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-2xl [&_svg]:size-6 lg:size-11", iconClass)}>{icon}</span>
      <div className="min-w-0 lg:w-full">
        <p className="truncate text-[13px] font-medium text-muted" title={label}>{label}</p>
        <p className="truncate text-xl font-extrabold tracking-tight text-ink tabular-nums sm:text-[22px]">{children}</p>
        {note}
      </div>
    </motion.div>
  );
}

/** Faixa horizontal de indicadores (sobreposta à base do destaque). */
export function StatsStrip({ stats, loading }: { stats: StripStats | null; loading?: boolean }) {
  return (
    <section
      aria-label="Indicadores"
      className="relative z-10 mx-3 -mt-10 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-line shadow-lift ring-1 ring-line/80 sm:mx-6 sm:grid-cols-2 lg:grid-cols-5"
    >
      {loading || !stats ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={cn("flex items-center gap-3.5 bg-white px-5 py-4 lg:flex-col lg:items-start lg:gap-3 lg:py-5", i === 0 && "sm:col-span-2 lg:col-span-1")}>
            <span className="skeleton size-12 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <span className="skeleton block h-3 w-24 rounded" />
              <span className="skeleton block h-5 w-16 rounded" />
            </div>
          </div>
        ))
      ) : (
        <>
          <Item
            index={0}
            className="sm:col-span-2 lg:col-span-1"
            icon={
              <span className="relative">
                <Smile strokeWidth={2.2} />
                <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-amber-300 ring-2 ring-white" aria-hidden />
              </span>
            }
            iconClass="bg-gradient-to-br from-amber-300 via-amber-400 to-orange-400 text-white shadow-[0_8px_18px_-8px_rgb(245_158_11/0.8)]"
            label="Clientes satisfeitos"
            note={
              stats.satisfiedIsDemo ? (
                <span className="mt-0.5 inline-block rounded-full bg-surface px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted ring-1 ring-line">
                  Demonstrativo
                </span>
              ) : undefined
            }
          >
            <CountUp value={stats.satisfiedClients} format={(n) => `${Math.round(n)}+`} />
          </Item>
          <Item index={1} icon={<Wallet />} iconClass="bg-brand-50 text-brand-600" label="Saldo do mês">
            <CountUp value={stats.monthBalance} format={formatBRL} />
          </Item>
          <Item index={2} icon={<ShoppingCart />} iconClass="bg-income-soft text-income" label="Vendas no mês">
            <CountUp value={stats.monthSales} />
          </Item>
          <Item index={3} icon={<Package />} iconClass="bg-navy-900/5 text-navy-800" label="Produtos cadastrados">
            <CountUp value={stats.products} />
          </Item>
          <Item
            index={4}
            icon={<TriangleAlert />}
            iconClass={stats.lowStock ? "bg-warn-soft text-warn" : "bg-surface text-muted"}
            label="Estoque baixo"
          >
            <CountUp value={stats.lowStock} format={(n) => `${Math.round(n)} ${Math.round(n) === 1 ? "item" : "itens"}`} />
          </Item>
        </>
      )}
    </section>
  );
}
