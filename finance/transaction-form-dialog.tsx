"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/config";
import { backend, friendlyError, type Transaction, type TransactionType } from "@/lib/data";
import { emit } from "@/lib/events";
import { useAccess } from "@/lib/hooks/use-access";
import { cn, fromDateTimeLocal, moneyToInput, toDateTimeLocal } from "@/lib/utils";
import { fieldErrors, transactionSchema } from "@/lib/validation";

export function TransactionFormDialog({
  open,
  onClose,
  initialType = "entrada",
  transaction,
}: {
  open: boolean;
  onClose: () => void;
  initialType?: TransactionType;
  transaction?: Transaction | null;
}) {
  const toast = useToast();
  const { ensureAccess } = useAccess();
  const [form, setForm] = useState({ type: initialType as TransactionType, description: "", amount: "", category: "", occurred_at: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (transaction) {
      setForm({
        type: transaction.type,
        description: transaction.description,
        amount: moneyToInput(transaction.amount),
        category: transaction.category,
        occurred_at: toDateTimeLocal(transaction.occurred_at),
        notes: transaction.notes ?? "",
      });
    } else {
      setForm({ type: initialType, description: "", amount: "", category: "", occurred_at: toDateTimeLocal(), notes: "" });
    }
  }, [open, transaction, initialType]);

  const categories: readonly string[] = form.type === "entrada" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const income = form.type === "entrada";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = transactionSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSaving(true);
    try {
      await ensureAccess();
      const payload = { ...parsed.data, occurred_at: fromDateTimeLocal(parsed.data.occurred_at) };
      if (transaction) await backend.updateTransaction(transaction.id, payload);
      else await backend.createTransaction(payload);
      emit("transactions", "notifications");
      toast.success(transaction ? "Movimentação atualizada" : income ? "Entrada registrada" : "Saída registrada", parsed.data.description);
      onClose();
    } catch (err) {
      toast.error("Não foi possível salvar", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      title={transaction ? "Editar movimentação" : income ? "Nova entrada" : "Nova saída"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="tx-form" variant={income ? "success" : "danger"} loading={saving}>
            {transaction ? "Salvar" : income ? "Registrar entrada" : "Registrar saída"}
          </Button>
        </>
      }
    >
      <form id="tx-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1 ring-1 ring-line" role="radiogroup" aria-label="Tipo de movimentação">
          {(["entrada", "saida"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={form.type === t}
              onClick={() => setForm({ ...form, type: t, category: "" })}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition",
                form.type === t ? (t === "entrada" ? "bg-income text-white shadow" : "bg-expense text-white shadow") : "text-muted hover:text-ink",
              )}
            >
              {t === "entrada" ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
              {t === "entrada" ? "Entrada" : "Saída"}
            </button>
          ))}
        </div>

        <Field label="Descrição" error={errors.description}>
          {(p) => (
            <Input
              {...p}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={income ? "Ex.: Serviço de personalização" : "Ex.: Aluguel da loja"}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)" error={errors.amount}>
            {(p) => <Input {...p} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0,00" />}
          </Field>
          <Field label="Categoria" error={errors.category}>
            {(p) => (
              <Select {...p} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">Selecione…</option>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
                {form.category && !categories.includes(form.category) && <option>{form.category}</option>}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Data e hora" error={errors.occurred_at}>
          {(p) => <Input {...p} type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} />}
        </Field>
        <Field label="Observações (opcional)" error={errors.notes}>
          {(p) => <Textarea {...p} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />}
        </Field>
      </form>
    </Dialog>
  );
}
