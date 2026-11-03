"use client";

import { AlarmClock, Crown, Megaphone, Package, Receipt, ShoppingCart, SlidersHorizontal, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { backend, friendlyError, type NotificationPrefs } from "@/lib/data";
import { useAccess } from "@/lib/hooks/use-access";
import { useLoad } from "@/lib/hooks/use-load";

const CATEGORIES: Array<{ key: keyof NotificationPrefs; label: string; hint: string; icon: ReactNode; reminders?: boolean }> = [
  { key: "estoque", label: "Estoque baixo", hint: "Quando um produto chega ao estoque mínimo", icon: <Package /> },
  { key: "vendas", label: "Vendas registradas", hint: "Confirmação de cada venda", icon: <ShoppingCart /> },
  { key: "despesas", label: "Despesas importantes", hint: "Saídas acima do valor definido em Alertas", icon: <Receipt /> },
  { key: "assinatura", label: "Assinatura", hint: "Vencimento próximo, ativação e renovação", icon: <Crown /> },
  { key: "lembretes", label: "Meus Lembretes", hint: "Pagamentos, compras e compromissos agendados", icon: <AlarmClock />, reminders: true },
  { key: "comunicados", label: "Comunicados", hint: "Avisos da equipe Estilos Gestor", icon: <Megaphone /> },
  { key: "sistema", label: "Avisos do sistema", hint: "Tempo de uso e avisos importantes", icon: <Sparkles /> },
];

/** Escolha das categorias enviadas ao celular/computador (evita excesso de notificações). */
export function NotificationPrefsCard() {
  const toast = useToast();
  const { entitlements } = useAccess();
  const prefs = useLoad(() => backend.getNotificationPrefs(), []);

  const toggle = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!prefs.data) return;
    const previous = prefs.data;
    prefs.setData({ ...previous, [key]: value });
    try {
      await backend.updateNotificationPrefs({ [key]: value });
    } catch (e) {
      prefs.setData(previous);
      toast.error("Não foi possível salvar", friendlyError(e));
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<SlidersHorizontal />}
        title="O que enviar para o aparelho"
        description="Escolha as categorias. Todas continuam registradas no sino e no histórico."
      />
      <CardBody>
        {prefs.loading || !prefs.data ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {CATEGORIES.map((c) => {
              const locked = c.reminders && !entitlements.reminders;
              return (
                <li key={c.key} className="flex items-center gap-3 py-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-muted ring-1 ring-line [&_svg]:size-4">{c.icon}</span>
                  <label htmlFor={`pref-${c.key}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-sm font-semibold text-ink">{c.label}</span>
                    <span className="block text-[12.5px] text-muted">{locked ? "Disponível nos planos Avançado e Completo" : c.hint}</span>
                  </label>
                  <Switch id={`pref-${c.key}`} label={c.label} checked={prefs.data![c.key] && !locked} disabled={locked} onChange={(v) => void toggle(c.key, v)} />
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
