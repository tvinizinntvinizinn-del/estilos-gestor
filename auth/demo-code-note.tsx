"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useState } from "react";
import { backend } from "@/lib/data";

/** Na demonstração não há envio de e-mail: o código aparece aqui, claramente identificado. */
export function DemoCodeNote({ email, refreshKey }: { email: string; refreshKey?: unknown }) {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    setCode(backend.demo?.peekCode(email) ?? null);
  }, [email, refreshKey]);
  if (!backend.demo || !code) return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
      <FlaskConical className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>Demonstração:</strong> nenhum e-mail é enviado. Use o código{" "}
        <span className="rounded-md bg-white px-1.5 py-0.5 font-mono font-bold tracking-widest">{code}</span>
      </p>
    </div>
  );
}
