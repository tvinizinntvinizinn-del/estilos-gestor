"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { EMark } from "@/components/brand/logo";
import { useAuth } from "@/lib/hooks/use-auth";

export function FullScreenLoader({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="bg-brand-night fixed inset-0 z-[90] grid place-items-center">
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-brand-500/30" aria-hidden />
          <EMark glow className="size-20 animate-float" />
        </div>
        <p className="text-sm font-medium text-white/70">{label}</p>
      </div>
    </div>
  );
}

/**
 * Proteção de rota no navegador (experiência). A proteção real dos dados
 * está no banco: Row Level Security + funções que verificam o usuário.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/entrar?next=${encodeURIComponent(pathname || "/app")}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <FullScreenLoader />;
  return <>{children}</>;
}

/** Páginas de login/cadastro: quem já está logado vai direto para o painel. */
export function RedirectIfAuthed({ to = "/app", children }: { to?: string; children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user) router.replace(to);
  }, [loading, user, router, to]);
  return <>{children}</>;
}
