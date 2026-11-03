"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowLeftRight, ArrowRight, BellRing, ChartLine, LockKeyhole, Package, ShoppingCart, Smartphone } from "lucide-react";
import { EMark, Logo } from "@/components/brand/logo";
import { DemoBanner } from "@/components/layout/demo-banner";
import { Footer } from "@/components/layout/footer";
import { comparePlanFor, PlanCard } from "@/components/plans/plan-card";
import { buttonVariants } from "@/components/ui/button";
import { backend } from "@/lib/data";
import { useAuth } from "@/lib/hooks/use-auth";
import { useLoad } from "@/lib/hooks/use-load";
import { cn, hoursLabel } from "@/lib/utils";

const features = [
  { icon: <ChartLine />, title: "Gráficos financeiros", text: "Entradas e saídas em linhas interativas, com filtros de hoje, semana, mês, ano ou período personalizado." },
  { icon: <Package />, title: "Produtos e estoque", text: "Cadastre preço, custo, categoria e foto. Receba alerta quando o estoque estiver baixo." },
  { icon: <ShoppingCart />, title: "Vendas sem retrabalho", text: "Ao confirmar uma venda, o estoque baixa e a entrada financeira é registrada sozinha." },
  { icon: <ArrowLeftRight />, title: "Entradas e saídas", text: "Fornecedores, aluguel, contas, serviços: tudo organizado por categoria e data." },
  { icon: <BellRing />, title: "Alertas e lembretes", text: "Notificações no celular e no computador e lembretes de pagamentos e compras na hora certa." },
  { icon: <Smartphone />, title: "No computador e no celular", text: "Funciona no navegador e pode ser instalado na tela inicial do Android e do iPhone." },
];

export default function HomePage() {
  const { user } = useAuth();
  const plans = useLoad(async () => {
    const [p, s] = await Promise.all([backend.getPlans(), backend.getSettings()]);
    return { plans: p.filter((x) => x.is_active), all: p, settings: s };
  }, []);

  return (
    <div className="min-h-dvh bg-white">
      <DemoBanner />
      {/* Hero */}
      <section className="bg-brand-night relative overflow-hidden text-white">
        <div className="bg-grid-faint absolute inset-0 opacity-60" aria-hidden />
        <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Logo size="sm" />
          <nav className="flex items-center gap-2">
            {user ? (
              <Link href="/app" className={buttonVariants({ size: "sm" })}>
                Ir para o painel
              </Link>
            ) : (
              <>
                <Link href="/entrar" className={cn(buttonVariants({ variant: "glass", size: "sm" }), "max-sm:hidden")}>
                  Entrar
                </Link>
                <Link href="/cadastro" className={buttonVariants({ size: "sm" })}>
                  Criar conta
                </Link>
              </>
            )}
          </nav>
        </header>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-20 pt-8 sm:px-8 md:grid-cols-[1.1fr_1fr] md:pb-28 md:pt-14">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-brand-300 ring-1 ring-white/10">
              <LockKeyhole className="size-3.5" /> Seus dados visíveis só para você
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
              Tenha controle completo do seu <span className="text-gradient-blue">negócio</span> em um só lugar.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/70">
              Produtos, vendas, entradas, saídas e gráficos financeiros no computador e no celular.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={user ? "/app" : "/cadastro"} className={buttonVariants({ size: "lg" })}>
                {user ? "Abrir o painel" : "Começar grátis"} <ArrowRight />
              </Link>
              <Link href="/planos" className={buttonVariants({ variant: "glass", size: "lg" })}>
                Ver planos
              </Link>
            </div>
            <p className="mt-4 text-sm text-white/50">Versão gratuita com {hoursLabel(plans.data?.settings.free_daily_seconds ?? 3600)} de uso por dia. Sem cartão de crédito.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto grid place-items-center"
          >
            <span className="absolute size-[300px] rounded-full border border-white/10 sm:size-[380px]" aria-hidden />
            <span className="absolute size-[400px] rounded-full border border-white/5 sm:size-[500px]" aria-hidden />
            <EMark glow className="relative size-56 animate-float sm:size-72" />
          </motion.div>
        </div>
      </section>

      {/* Recursos */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Tudo o que o seu negócio precisa</h2>
          <p className="mt-3 text-muted">Simples de usar no dia a dia, completo para você entender para onde o dinheiro vai.</p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ delay: i * 0.05 }}
              className="rounded-3xl border border-line bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-b from-brand-500 to-brand-700 text-white shadow-[0_10px_24px_-10px_rgb(37_99_235/0.8)] [&_svg]:size-6">
                {f.icon}
              </span>
              <h3 className="mt-5 text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-[15px] text-muted">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section className="bg-brand-night relative overflow-hidden px-5 py-20 sm:px-8">
        <div className="bg-grid-faint absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Planos</h2>
            <p className="mt-3 text-white/65">Comece grátis com {hoursLabel(plans.data?.settings.free_daily_seconds ?? 3600)} por dia. Assine para usar mais tempo, receber notificações e criar lembretes.</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {(plans.data?.plans ?? []).map((p, i) => (
              <PlanCard key={p.id} plan={p} index={i} whatsappNumber={plans.data?.settings.whatsapp_number ?? null} mode={user ? "whatsapp" : "signup"} email={user?.email} comparePlan={comparePlanFor(p, plans.data?.all ?? [])} />
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
