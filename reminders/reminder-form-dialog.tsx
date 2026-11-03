"use client";

import { CreditCard, NotebookPen, ShoppingBag } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { REMINDER_ADVANCE, REMINDER_REPEATS } from "@/lib/config";
import { backend, friendlyError, type Reminder, type ReminderCategory } from "@/lib/data";
import { emit } from "@/lib/events";
import { brDateKey, cn, moneyToInput } from "@/lib/utils";
import { fieldErrors, reminderSchema } from "@/lib/validation";

export const categoryMeta: Record<ReminderCategory, { label: string; icon: ReactNode; cls: string }> = {
  pagamento: { label: "Pagamento", icon: <CreditCard />, cls: "bg-expense-soft text-expense" },
  compra: { label: "Compra", icon: <ShoppingBag />, cls: "bg-brand-50 text-brand-600" },
  outro: { label: "Outro", icon: <NotebookPen />, cls: "bg-navy-900/5 text-navy-800" },
};

const QUICK: Array<{ title: string; category: ReminderCategory }> = [
  { title: "Pagar fornecedor", category: "pagamento" },
  { title: "Pagar conta de energia", category: "pagamento" },
  { title: "Comprar mercadorias", category: "compra" },
  { title: "Comprar novos produtos para o estoque", category: "compra" },
];

/** Próxima hora cheia no horário de Brasília */
function defaultSlot() {
  const brNow = new Date(Date.now() - 3 * 3_600_000);
  brNow.setUTCMinutes(0, 0, 0);
  brNow.setUTCHours(brNow.getUTCHours() + 1);
  return { date: brNow.toISOString().slice(0, 10), time: brNow.toISOString().slice(11, 16) };
}

const emptyForm = () => {
  const slot = defaultSlot();
  return {
    title: "",
    description: "",
    category: "pagamento" as ReminderCategory,
    due_date: slot.date,
    due_time: slot.time,
    amount: "",
    repeat: "unica" as Reminder["repeat"],
    notify_before_minutes: "0",
  };
};

export function ReminderFormDialog({ open, onClose, reminder }: { open: boolean; onClose: () => void; reminder?: Reminder | null }) {
  const toast = useToast();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      reminder
        ? {
            title: reminder.title,
            description: reminder.description ?? "",
            category: reminder.category,
            due_date: reminder.due_date,
            due_time: reminder.due_time.slice(0, 5),
            amount: reminder.amount != null ? moneyToInput(reminder.amount) : "",
            repeat: reminder.repeat,
            notify_before_minutes: String(reminder.notify_before_minutes),
          }
        : emptyForm(),
    );
  }, [open, reminder]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = reminderSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSaving(true);
    try {
      if (reminder) await backend.updateReminder(reminder.id, parsed.data);
      else await backend.createReminder(parsed.data);
      emit("reminders");
      toast.success(reminder ? "Lembrete atualizado" : "Lembrete criado", parsed.data.title);
      onClose();
    } catch (err) {
      toast.error("Não foi possível salvar", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const today = brDateKey(new Date());

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      title={reminder ? "Editar lembrete" : "Novo lembrete"}
      description="O aviso chega no celular e no computador no horário escolhido (horário de Brasília)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="reminder-form" loading={saving}>
            {reminder ? "Salvar" : "Criar lembrete"}
          </Button>
        </>
      }
    >
      <form id="reminder-form" onSubmit={submit} className="space-y-4" noValidate>
        {!reminder && (
          <div className="flex flex-wrap gap-1.5" aria-label="Sugestões">
            {QUICK.map((q) => (
              <button
                key={q.title}
                type="button"
                onClick={() => setForm({ ...form, title: q.title, category: q.category })}
                className="rounded-full bg-surface px-3 py-1 text-[12.5px] font-medium text-ink/80 ring-1 ring-line transition hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-200"
              >
                {q.title}
              </button>
            ))}
          </div>
        )}

        <Field label="Título do lembrete" error={errors.title}>
          {(p) => <Input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex.: Pagar fornecedor" maxLength={120} />}
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">Categoria</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Categoria">
            {(Object.keys(categoryMeta) as ReminderCategory[]).map((c) => {
              const active = form.category === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setForm({ ...form, category: c })}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-semibold ring-1 transition [&_svg]:size-4",
                    active ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-muted ring-line hover:text-ink hover:ring-brand-200",
                  )}
                >
                  {categoryMeta[c].icon}
                  {categoryMeta[c].label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data" error={errors.due_date}>
            {(p) => <Input {...p} type="date" min={reminder ? undefined : today} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />}
          </Field>
          <Field label="Horário" error={errors.due_time}>
            {(p) => <Input {...p} type="time" value={form.due_time} onChange={(e) => setForm({ ...form, due_time: e.target.value })} />}
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Repetição" error={errors.repeat}>
            {(p) => (
              <Select {...p} value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value as Reminder["repeat"] })}>
                {REMINDER_REPEATS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Avisar" error={errors.notify_before_minutes}>
            {(p) => (
              <Select {...p} value={form.notify_before_minutes} onChange={(e) => setForm({ ...form, notify_before_minutes: e.target.value })}>
                {REMINDER_ADVANCE.map((a) => (
                  <option key={a.value} value={String(a.value)}>
                    {a.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Valor (opcional)" error={errors.amount} hint="Aparece na notificação, ex.: “Valor: R$ 350,00”.">
          {(p) => <Input {...p} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="R$ 0,00" />}
        </Field>

        <Field label="Descrição (opcional)" error={errors.description}>
          {(p) => <Textarea {...p} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} placeholder="Ex.: boleto da distribuidora" />}
        </Field>
      </form>
    </Dialog>
  );
}
