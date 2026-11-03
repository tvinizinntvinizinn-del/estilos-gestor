"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Lock, LogOut } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { useAccess } from "@/lib/hooks/use-access";
import { useAuth } from "@/lib/hooks/use-auth";
import { cn, initials } from "@/lib/utils";
import { isActive, mainNav, ownerNav } from "./nav-items";

export function Sidebar() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { status, entitlements, ready } = useAccess();
  const items = status?.is_admin ? [...mainNav, ...ownerNav] : mainNav;

  return (
    <aside className="bg-brand-night sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col overflow-hidden text-white lg:flex">
      <div className="bg-grid-faint pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative px-6 pb-6 pt-7">
        <Link href="/app">
          <Logo size="md" />
        </Link>
      </div>

      <nav className="relative flex-1 space-y-1 px-3" aria-label="Navegação principal">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[14.5px] font-medium transition-colors",
                active ? "text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500/80 shadow-[0_8px_24px_-10px_rgb(37_99_235/0.9)]"
                  transition={{ type: "spring", stiffness: 420, damping: 36 }}
                />
              )}
              <span className="relative [&_svg]:size-[19px]">{item.icon}</span>
              <span className="relative">{item.label}</span>
              {item.feature === "reminders" && ready && !entitlements.reminders && (
                <Lock className="relative ml-auto size-3.5 text-white/40" aria-label="Disponível nos planos Avançado e Completo" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="relative m-3 rounded-2xl bg-white/[0.06] p-3 ring-1 ring-white/10">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-brand-500 to-brand-700 text-sm font-bold">
            {initials(user?.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name || "Minha conta"}</p>
            <p className="truncate text-xs text-white/50">{user?.email}</p>
          </div>
          <button
            onClick={async () => {
              await signOut();
              router.replace("/entrar");
            }}
            className="grid size-9 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}
