"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AlarmClock, Bell, BellRing, CheckCheck, Crown, History, Megaphone, MonitorSmartphone, Package, Receipt, ShoppingCart, Sparkles, Timer, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { backend, friendlyError, type AppNotification, type NotificationKind } from "@/lib/data";
import { emit, on } from "@/lib/events";
import { cn, relativeTime } from "@/lib/utils";

export const kindStyle: Record<NotificationKind, { icon: ReactNode; cls: string }> = {
  estoque: { icon: <Package />, cls: "bg-warn-soft text-warn" },
  venda: { icon: <ShoppingCart />, cls: "bg-income-soft text-income" },
  despesa: { icon: <Receipt />, cls: "bg-expense-soft text-expense" },
  plano: { icon: <Crown />, cls: "bg-brand-50 text-brand-600" },
  tempo: { icon: <Timer />, cls: "bg-expense-soft text-expense" },
  admin: { icon: <Megaphone />, cls: "bg-navy-900 text-white" },
  sistema: { icon: <Sparkles />, cls: "bg-brand-50 text-brand-600" },
  lembrete: { icon: <AlarmClock />, cls: "bg-amber-100 text-amber-700" },
};

/** Central de notificações (sino do cabeçalho). Atualiza em tempo real. */
export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setItems(await backend.listNotifications());
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useEffect(() => {
    void load();
    const unsub = backend.subscribeNotifications(() => void load());
    const off = on(["notifications", "sales", "products", "transactions", "status"], () => void load());
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      unsub();
      off();
      window.clearInterval(id);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  const openItem = async (n: AppNotification) => {
    if (!n.read_at) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      await backend.markNotificationRead(n.id).catch(() => undefined);
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  };

  const markAll = async () => {
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    await backend.markAllNotificationsRead().catch(() => undefined);
    emit("notifications");
  };

  const remove = async (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    await backend.deleteNotification(id).catch(() => undefined);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-10 place-items-center rounded-xl bg-white text-ink ring-1 ring-line transition hover:ring-brand-300"
        aria-label={`Notificações${unread ? ` (${unread} não lidas)` : ""}`}
        aria-expanded={open}
      >
        {unread ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-expense px-1 text-[11px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-x-3 top-[68px] z-[70] origin-top-right overflow-hidden rounded-2xl bg-white shadow-lift ring-1 ring-line sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-semibold">Notificações</p>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button onClick={markAll} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                    <CheckCheck className="size-3.5" /> Marcar todas como lidas
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface sm:hidden" aria-label="Fechar">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="scrollbar-thin max-h-[60dvh] overflow-y-auto">
              {error && <p className="px-4 py-3 text-sm text-expense">{error}</p>}
              {!items.length && !error && (
                <div className="px-6 py-10 text-center">
                  <Bell className="mx-auto size-8 text-line" />
                  <p className="mt-2 text-sm text-muted">Nenhuma notificação por enquanto.</p>
                </div>
              )}
              <ul>
                {items.map((n) => {
                  const k = kindStyle[n.kind] ?? kindStyle.sistema;
                  return (
                    <li key={n.id} className={cn("group flex gap-3 border-b border-line/70 px-4 py-3 last:border-0", !n.read_at && "bg-brand-50/50")}>
                      <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl [&_svg]:size-4", k.cls)}>{k.icon}</span>
                      <button onClick={() => openItem(n)} className="min-w-0 flex-1 text-left">
                        <p className={cn("text-sm", n.read_at ? "font-medium text-ink/80" : "font-semibold text-ink")}>{n.title}</p>
                        {n.body && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{n.body}</p>}
                        <p className="mt-1 text-[11px] font-medium text-muted/80">{relativeTime(n.created_at)}</p>
                      </button>
                      <div className="flex flex-col items-end gap-2">
                        {!n.read_at && <span className="mt-1.5 size-2 rounded-full bg-brand-600" aria-label="Não lida" />}
                        <button
                          onClick={() => remove(n.id)}
                          className="text-muted opacity-0 transition hover:text-expense group-hover:opacity-100 max-sm:opacity-60"
                          aria-label="Excluir notificação"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line bg-surface/60 px-3 py-2">
              <Link href="/app/notificacoes" onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                <History className="size-3.5" /> Ver histórico
              </Link>
              <Link
                href="/app/configuracoes#notificacoes"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted hover:bg-white hover:text-ink"
              >
                <MonitorSmartphone className="size-3.5" /> Notificações no aparelho
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
