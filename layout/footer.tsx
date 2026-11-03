"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { InstagramButton, WhatsAppButton, formatWhatsapp } from "@/components/support/contact-buttons";
import { siteConfig } from "@/lib/config";
import { usePublicSettings } from "@/lib/hooks/use-settings";
import { cn } from "@/lib/utils";

/** Rodapé: marca, contato (WhatsApp, Instagram, e-mail), links legais e direitos autorais. */
export function Footer({ variant = "dark", className }: { variant?: "dark" | "light"; className?: string }) {
  const { supportEmail, whatsappNumber } = usePublicSettings();
  const dark = variant === "dark";
  const link = cn("transition", dark ? "hover:text-white" : "hover:text-ink");

  return (
    <footer
      className={cn(
        dark ? "bg-navy-950 text-white/70" : "border-t border-line bg-white text-muted",
        "px-5 py-8 text-sm sm:px-8",
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <Logo tone={dark ? "dark" : "light"} size="sm" />
          <p className="max-w-xs text-[13px]">{siteConfig.description}</p>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <p className={cn("text-xs font-semibold uppercase tracking-wide", dark ? "text-white/45" : "text-muted")}>Atendimento</p>
          <div className="flex flex-wrap items-center gap-2">
            <WhatsAppButton size="sm" label="WhatsApp" />
            <InstagramButton size="sm" />
          </div>
          <div className="flex flex-col gap-1 text-[13px] md:items-end">
            {whatsappNumber && <span>{formatWhatsapp(whatsappNumber)}</span>}
            {supportEmail ? (
              <a
                href={`mailto:${supportEmail}`}
                className={cn("inline-flex items-center gap-1.5 font-medium transition", dark ? "text-brand-400 hover:text-white" : "text-brand-600 hover:text-brand-700")}
              >
                <Mail className="size-4" />
                {supportEmail}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "mx-auto mt-6 flex max-w-6xl flex-col gap-3 border-t pt-5 md:flex-row md:items-center md:justify-between",
          dark ? "border-white/10" : "border-line",
        )}
      >
        <p className="text-[13px]">
          © {new Date().getFullYear()} {siteConfig.name}. Todos os direitos reservados.
        </p>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2" aria-label="Links legais">
          <Link href="/privacidade" className={link}>
            Política de Privacidade
          </Link>
          <Link href="/termos" className={link}>
            Termos de Uso
          </Link>
        </nav>
      </div>
    </footer>
  );
}
