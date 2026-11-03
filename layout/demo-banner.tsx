"use client";

import { FlaskConical } from "lucide-react";
import { isDemo } from "@/lib/data";
import { cn } from "@/lib/utils";

/** Identificação clara de que nada aqui é real enquanto o Supabase não estiver configurado. */
export function DemoBanner({ className }: { className?: string }) {
  if (!isDemo) return null;
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 bg-amber-400 px-4 py-1.5 text-center text-[12.5px] font-semibold text-amber-950",
        className,
      )}
    >
      <FlaskConical className="size-3.5 shrink-0" />
      <span>
        Modo demonstração: dados salvos só neste navegador, sem e-mails nem pagamentos reais.
      </span>
    </div>
  );
}
