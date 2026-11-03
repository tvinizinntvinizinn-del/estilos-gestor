"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Crown, Lock, LogOut, Menu, MoonStar, Timer } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { EBadge } from "@/components/brand/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useAccess } from "@/lib/hooks/use-access";
import { useAuth } from "@/lib/hooks/use-auth";
import { cn, initials } from "@/lib/utils";
import { DemoBanner } from "./demo-banner";
import { Footer } from "./footer";
import { FreeTimer } from "./free-timer";
import { isActive, mainNav, ownerNav } from "./nav-items";
import { NotificationsBell } from "./notifications-bell";
import { Sidebar } from "./sidebar";

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-surface/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Celular: marca compacta */}
        <Link href="/app" className="lg:hidden" aria-label="Início">
          <EBadge className="size-9" />
        </Link>
        {/* Contador no canto superior esquerdo do painel */}
        <FreeTimer />
        <div className="ml-auto flex items-center gap-2">
          <NotificationsBell />
          <Link
            href="/app/configuracoes"
            className="hidden size-10 place-items-center rounded-xl bg-navy-900 text-sm font-bold text-white sm:grid"
            aria-label="Minha conta"
            title={user?.email}
          >
            {initials(user?.name)}
          </Link>
          <button onClick={onMenu} className="grid size-10 place-items-center rounded-xl bg-white ring-1 ring-line lg:hidden" aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  const pathname = usePathname() ?? "";
  const items = mainNav.slice(0, 4);
  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 backdrop-blur-xl lg:hidden"
      aria-label="Navegação principal"
    >
      <div className="grid grid-cols-4">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] font-semibold transition-colors",
                active ? "text-brand-600" : "text-muted",
              )}
            >
              {active && <motion.span layoutId="mobile-active" className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-brand-600" />}
              <span className="[&_svg]:size-[22px]">{item.icon}</span>
              {item.short ?? item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { status, entitlements, ready } = useAccess();
  const items = status?.is_admin ? [...mainNav, ...ownerNav] : mainNav;
  return (
    <Dialog open={open} onClose={onClose} title={user?.name || "Menu"} description={user?.email}>
      <div className="grid gap-1 pb-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium [&_svg]:size-5",
              isActive(pathname, item.href) ? "bg-brand-50 text-brand-700" : "text-ink hover:bg-surface",
            )}
          >
            {item.icon}
            {item.label}
            {item.feature === "reminders" && ready && !entitlements.reminders && <Lock className="ml-auto !size-4 text-muted" aria-label="Recurso dos planos Avançado e Completo" />}
          </Link>
        ))}
        <button
          onClick={async () => {
            onClose();
            await signOut();
            router.replace("/entrar");
          }}
          className="mt-2 flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-expense hover:bg-expense-soft"
        >
          <LogOut className="size-5" /> Sair
        </button>
      </div>
    </Dialog>
  );
}

function useRenewalText(resetsAt: string | null | undefined) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (!resetsAt) return null;
  const ms = Math.max(0, new Date(resetsAt).getTime() - Date.now());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.ceil((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}min` : `${m} min`;
}

/** Bloqueio quando o tempo do dia termina (gratuito: 1h; Básico: 10h). */
function TimeUpOverlay() {
  const { blocked, usage } = useAccess();
  const { signOut } = useAuth();
  const router = useRouter();
  const renewIn = useRenewalText(usage?.resets_at);
  const planLimited = usage?.scope === "plano";
  const hours = usage?.limit_seconds ? Math.round((usage.limit_seconds / 3600) * 10) / 10 : null;
  return (
    <AnimatePresence>
      {blocked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] grid place-items-center bg-navy-950/70 p-5 backdrop-blur-md"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="time-up-title"
        >
          <motion.div
            initial={{ y: 24, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="bg-brand-night relative w-full max-w-md overflow-hidden rounded-3xl p-7 text-center text-white shadow-lift ring-1 ring-white/10"
          >
            <div className="bg-grid-faint absolute inset-0 opacity-50" aria-hidden />
            <div className="relative">
              <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-white/10 text-brand-400 ring-1 ring-white/15">
                <Timer className="size-8" />
              </span>
              <h2 id="time-up-title" className="mt-5 text-2xl font-bold tracking-tight">
                {planLimited ? `Seu limite diário de ${hours?.toLocaleString("pt-BR")} horas terminou` : "Seu tempo gratuito de hoje terminou!"}
              </h2>
              <p className="mt-2 text-white/70">
                {planLimited
                  ? `O acesso ao ${usage?.plan_name ?? "seu plano"} será renovado automaticamente. Para usar sem limite diário, conheça o Plano Avançado.`
                  : "Volte amanhã ou escolha um dos nossos planos para continuar utilizando a plataforma."}
              </p>
              <p className="mx-auto mt-4 inline-flex items-center gap-2 rounded-xl bg-white/8 px-3 py-2 text-sm ring-1 ring-white/10">
                <MoonStar className="size-4 text-brand-300" />
                <span>
                  Renova à meia-noite (horário de Brasília){renewIn ? <> · em <strong>{renewIn}</strong></> : null}
                </span>
              </p>
              <div className="mt-7 flex flex-col gap-2">
                <Link href="/planos" className={cn(buttonVariants({ size: "lg" }), "w-full")}>
                  <Crown /> {planLimited ? "Ver planos sem limite" : "Conhecer planos"}
                </Link>
                <Button
                  variant="glass"
                  size="lg"
                  onClick={async () => {
                    await signOut();
                    router.replace("/");
                  }}
                >
                  Sair
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [pathname]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DemoBanner />
        <Topbar onMenu={() => setMenu(true)} />
        <main className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto w-full max-w-[1200px]"
          >
            {children}
          </motion.div>
        </main>
        <Footer variant="light" className="mb-16 lg:mb-0" />
      </div>
      <MobileNav />
      <MenuSheet open={menu} onClose={() => setMenu(false)} />
      <TimeUpOverlay />
    </div>
  );
}
