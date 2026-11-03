"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Campo de código com 6 casas (aceita colar o código inteiro). */
export function CodeInput({
  value,
  onChange,
  length = 6,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  invalid?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const setAt = (i: number, d: string) => {
    const arr = digits.slice();
    arr[i] = d;
    onChange(arr.join("").slice(0, length));
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="Código de verificação">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Dígito ${i + 1}`}
          aria-invalid={invalid || undefined}
          maxLength={length}
          onChange={(e) => {
            const only = e.target.value.replace(/\D/g, "");
            if (only.length > 1) {
              // colou o código
              onChange((digits.slice(0, i).join("") + only).slice(0, length));
              refs.current[Math.min(i + only.length, length - 1)]?.focus();
              return;
            }
            setAt(i, only);
            if (only && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
          }}
          className={cn(
            "h-14 w-full min-w-0 rounded-2xl border bg-white text-center text-2xl font-bold text-ink transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15",
            invalid ? "border-expense" : d ? "border-brand-300" : "border-line",
          )}
        />
      ))}
    </div>
  );
}
