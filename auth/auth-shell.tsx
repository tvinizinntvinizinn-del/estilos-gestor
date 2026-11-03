"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { BellRing, ChartLine, Package, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { EMark, Logo, Wordmark } from "@/components/brand/logo";
import { DemoBanner } from "@/components/layout/demo-banner";

const highlights = [
  { icon: <ChartLine />, text: "Gráficos de entradas e saídas em tempo real" },
  { icon: <Package />, text: "Produtos, estoque e vendas no mesmo lugar" },
  { icon: <BellRing />, text: "Alertas de estoque baixo e despesas importantes" },
  { icon: <ShieldCheck />, text: "Seus dados protegidos e visíveis só para você" },
];

/** Layout das telas de entrada: painel da marca à esquerda e formulário à direita. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <DemoBanner />
      <div className="grid flex-1 lg:grid-cols-[1.05fr_1fr]">
        {/* Marca */}
        <aside className="bg-brand-night relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div className="bg-grid-faint absolute inset-0 opacity-60" aria-hidden />
          <Link href="/" className="relative">
            <Logo size="md" />
          </Link>
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <EMark glow className="mb-8 size-44 animate-float" />
            </motion.div>
            <h2 className="max-w-md text-4xl font-extrabold leading-tight tracking-tight text-white">
              Tenha controle completo do seu negócio em um só lugar.
            </h2>
            <ul className="mt-8 space-y-3.5">
              {highlights.map((h, i) => (
                <motion.li
                  key={h.text}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + i * 0.08 }}
                  className="flex items-center gap-3 text-[15px] text-white/80"
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-white/8 text-brand-400 ring-1 ring-white/10 [&_svg]:size-[18px]">
                    {h.icon}
                  </span>
                  {h.text}
                </motion.li>
              ))}
            </ul>
          </div>
          <p className="relative text-sm text-white/40">© {new Date().getFullYear()} Estilos Gestor</p>
        </aside>

        {/* Formulário */}
        <main className="flex flex-col">
          <div className="bg-brand-night relative overflow-hidden px-6 pb-14 pt-8 lg:hidden">
            <div className="bg-grid-faint absolute inset-0 opacity-50" aria-hidden />
            <Link href="/" className="relative flex flex-col items-center gap-2">
              <EMark glow className="size-20" />
              <Wordmark className="text-2xl" />
            </Link>
          </div>
          <div className="-mt-8 flex flex-1 items-start justify-center rounded-t-[28px] bg-white px-5 pb-10 pt-8 sm:px-8 lg:mt-0 lg:items-center lg:rounded-none">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-[420px]"
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}

export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-[26px] font-bold tracking-tight text-ink">{title}</h1>
      {description && <p className="mt-1.5 text-[15px] text-muted">{description}</p>}
    </div>
  );
}
