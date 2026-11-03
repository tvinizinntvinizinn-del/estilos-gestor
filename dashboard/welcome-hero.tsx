"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeftRight, ShoppingCart } from "lucide-react";
import { EMark } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { siteConfig } from "@/lib/config";
import { cn, firstName } from "@/lib/utils";

/**
 * Área de destaque do painel. Se `siteConfig.heroImage` apontar para uma imagem
 * com direito de uso (ex.: a foto da referência), ela aparece à direita — sem gráficos decorativos.
 */
export function WelcomeHero({ name }: { name?: string }) {
  const first = firstName(name);
  return (
    <section className="bg-brand-night relative overflow-hidden rounded-3xl text-white shadow-lift">
      <div className="bg-grid-faint absolute inset-0 opacity-60" aria-hidden />
      <div className="relative grid items-center gap-6 px-6 pb-16 pt-8 sm:px-10 sm:pb-20 sm:pt-10 md:grid-cols-[1.25fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="text-sm font-semibold text-brand-300">Painel do seu negócio</p>
          <h1 className="mt-2 text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">
            Olá{first ? `, ${first}` : ""}, seja{" "}
            <span className="whitespace-nowrap">
              bem-vindo! <span className="inline-block origin-[70%_70%] animate-[wave_2.4s_ease-in-out_1]">👋</span>
            </span>
          </h1>
          <p className="mt-3 max-w-md text-[15px] text-white/70 sm:text-base">Tenha controle completo do seu negócio em um só lugar.</p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/app/produtos?vender=1" className={buttonVariants({ size: "lg" })}>
              <ShoppingCart /> Registrar venda
            </Link>
            <Link href="/app/entradas-saidas?nova=1" className={buttonVariants({ variant: "glass", size: "lg" })}>
              <ArrowLeftRight /> Nova movimentação
            </Link>
          </div>
        </motion.div>

        <div className="relative hidden h-full min-h-[220px] items-center justify-center md:flex">
          {siteConfig.heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={siteConfig.heroImage}
              alt="Empreendedora usando o Estilos Gestor"
              className="absolute bottom-[-64px] right-0 h-[calc(100%+64px)] max-h-[340px] w-auto object-contain object-bottom"
            />
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative"
            >
              <span className="absolute inset-0 m-auto size-52 rounded-full border border-white/10" aria-hidden />
              <span className="absolute inset-0 m-auto size-72 rounded-full border border-white/5" aria-hidden />
              <EMark glow className={cn("relative size-48 animate-float")} />
            </motion.div>
          )}
        </div>
      </div>
      <style>{`@keyframes wave{0%,60%,100%{transform:rotate(0)}10%,30%{transform:rotate(14deg)}20%{transform:rotate(-8deg)}40%{transform:rotate(-4deg)}50%{transform:rotate(10deg)}}`}</style>
    </section>
  );
}
