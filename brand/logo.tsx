import { cn } from "@/lib/utils";

/** O "E" da marca (recortado da logo original, fundo transparente). */
export function EMark({ className, glow = false, small = false }: { className?: string; glow?: boolean; small?: boolean }) {
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)}>
      {glow && <span className="absolute inset-[12%] rounded-full bg-brand-500/45 blur-2xl" aria-hidden />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={small ? "/brand/logo-e-sm.png" : "/brand/logo-e.png"}
        alt=""
        aria-hidden
        draggable={false}
        className="relative h-full w-full select-none object-contain"
      />
    </span>
  );
}

/** "E" dentro de um bloco escuro: funciona sobre fundos claros. */
export function EBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_40%,#1d3f7a,#0b1d3a_60%,#050d1d)] ring-1 ring-white/10",
        className,
      )}
    >
      <EMark small className="h-[78%] w-[78%]" />
    </span>
  );
}

/** Nome da plataforma no mesmo estilo da logo: "Estilos" prata + "Gestor" azul. */
export function Wordmark({ className, tone = "dark" }: { className?: string; tone?: "dark" | "light" }) {
  return (
    <span className={cn("font-extrabold tracking-tight", className)}>
      <span className={tone === "dark" ? "text-gradient-silver" : "text-navy-900"}>Estilos</span>{" "}
      <span className="text-gradient-blue">Gestor</span>
    </span>
  );
}

export function Logo({
  className,
  tone = "dark",
  size = "md",
}: {
  className?: string;
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
}) {
  const mark = size === "lg" ? "size-14" : size === "sm" ? "size-8" : "size-10";
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-xl";
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)} aria-label="Estilos Gestor">
      {tone === "dark" ? <EMark small className={mark} /> : <EBadge className={mark} />}
      <Wordmark tone={tone} className={text} />
    </span>
  );
}
