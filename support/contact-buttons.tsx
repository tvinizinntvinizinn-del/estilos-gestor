"use client";

import { InstagramIcon, WhatsAppIcon } from "@/components/brand/social-icons";
import { usePublicSettings } from "@/lib/hooks/use-settings";
import { cn } from "@/lib/utils";
import { whatsappLink } from "@/lib/whatsapp";

/** "+55 11 95931-1513" a partir de "5511959311513" */
export function formatWhatsapp(digits: string | null | undefined) {
  const d = (digits ?? "").replace(/\D/g, "");
  const m = d.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+${m[1]} ${m[2]} ${m[3]}-${m[4]}` : d ? `+${d}` : "";
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-4 [&_svg]:shrink-0";

/** Botão oficial do WhatsApp. Sem número configurado, não aparece (nenhum link quebrado). */
export function WhatsAppButton({
  message = "Olá! Vim pelo site do Estilos Gestor e gostaria de ajuda.",
  label = "Falar no WhatsApp",
  size = "md",
  showNumber = false,
  className,
}: {
  message?: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  showNumber?: boolean;
  className?: string;
}) {
  const { whatsappNumber } = usePublicSettings();
  const href = whatsappLink(whatsappNumber, message);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        base,
        "bg-[#25D366] text-white shadow-[0_8px_20px_-10px_rgb(37_211_102/0.9)] hover:bg-[#1ebe5a] focus-visible:ring-[#25D366]/30",
        size === "sm" && "h-9 px-3 text-[13px] [&_svg]:size-4",
        size === "md" && "h-11 px-4 text-sm [&_svg]:size-5",
        size === "lg" && "h-12 px-5 text-[15px] [&_svg]:size-5",
        className,
      )}
    >
      <WhatsAppIcon />
      <span>{label}</span>
      {showNumber && <span className="font-medium opacity-85">· {formatWhatsapp(whatsappNumber)}</span>}
    </a>
  );
}

/** Botão do Instagram: só aparece quando o proprietário cadastra o perfil no painel. */
export function InstagramButton({ size = "md", label = "Instagram", className }: { size?: "sm" | "md"; label?: string; className?: string }) {
  const { instagramUrl } = usePublicSettings();
  if (!instagramUrl) return null;
  return (
    <a
      href={instagramUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Instagram do Estilos Gestor"
      className={cn(
        base,
        "bg-[linear-gradient(45deg,#f9a03f_0%,#e1306c_45%,#833ab4_100%)] text-white shadow-[0_8px_20px_-10px_rgb(225_48_108/0.8)] hover:brightness-110 focus-visible:ring-pink-500/30",
        size === "sm" && "h-9 px-3 text-[13px] [&_svg]:size-4",
        size === "md" && "h-11 px-4 text-sm [&_svg]:size-5",
        className,
      )}
    >
      <InstagramIcon />
      <span>{label}</span>
    </a>
  );
}
