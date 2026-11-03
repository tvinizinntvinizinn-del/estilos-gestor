"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Janela modal acessível: vira "bottom sheet" no celular e janela central no computador.
 * Fecha com Esc ou clicando fora (a menos que `dismissable` seja false).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissable = true,
  tone = "light",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissable?: boolean;
  tone?: "light" | "dark";
}) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]):not([disabled]), select, textarea");
      if (el && window.matchMedia("(pointer: fine)").matches) el.focus();
      else panelRef.current?.focus();
    }, 60);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, dismissable, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-navy-950/55 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => dismissable && onClose()}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl shadow-lift outline-none sm:rounded-3xl",
              tone === "dark" ? "bg-navy-900 text-white ring-1 ring-white/10" : "bg-white",
              size === "sm" && "sm:max-w-md",
              size === "md" && "sm:max-w-lg",
              size === "lg" && "sm:max-w-2xl",
            )}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden />
            {(title || dismissable) && (
              <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
                <div className="min-w-0">
                  {title && (
                    <h2 id={titleId} className="text-lg font-semibold tracking-tight">
                      {title}
                    </h2>
                  )}
                  {description && <p className={cn("mt-1 text-sm", tone === "dark" ? "text-white/65" : "text-muted")}>{description}</p>}
                </div>
                {dismissable && (
                  <button
                    onClick={onClose}
                    aria-label="Fechar"
                    className={cn(
                      "-mr-1 grid size-9 shrink-0 place-items-center rounded-full transition",
                      tone === "dark" ? "text-white/70 hover:bg-white/10" : "text-muted hover:bg-surface hover:text-ink",
                    )}
                  >
                    <X className="size-5" />
                  </button>
                )}
              </div>
            )}
            <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2 sm:px-6">{children}</div>
            {footer && (
              <div
                className={cn(
                  "safe-bottom flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6",
                  tone === "dark" ? "border-white/10" : "border-line bg-surface/60",
                )}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
