"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Footer } from "./footer";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <header className="bg-brand-night">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/">
            <Logo size="sm" />
          </Link>
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 hover:text-white">
            <ArrowLeft className="size-4" /> Voltar
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Última atualização: {updated}</p>
        <div className="mt-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn ring-1 ring-warn/20">
          Modelo inicial. Revise com um profissional jurídico e complete os dados da empresa antes de publicar.
        </div>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink/85 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          {children}
        </div>
      </main>
      <Footer variant="light" />
    </div>
  );
}
