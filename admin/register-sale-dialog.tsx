"use client";

import { CircleCheck, Clock3, Info, LoaderCircle, UserCheck, UserX } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { backend, friendlyError, type SubscriptionPaymentMethod, type SubscriptionSaleRow } from "@/lib/data";
import { emit } from "@/lib/events";
import { useLoad } from "@/lib/hooks/use-load";
import { brDateKey, cn, formatBRL, formatDate, moneyToInput, uid } from "@/lib/utils";
import { fieldErrors, subscriptionSaleSchema } from "@/lib/validation";

export const SUBSCRIPTION_METHODS: Array<{ value: SubscriptionPaymentMethod; label: string }> = [
  { value: "pix", label: "Pix" },
  { value: "transferencia", label: "Transferência bancária" },
  { value: "credito", label: "Cartão de crédito" },
  { value: "debito", label: "Cartão de débito" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "boleto", label: "Boleto" },
  { value: "outro", label: "Outro" },
];
export const methodLabel = (m: string | null | undefined) => SUBSCRIPTION_METHODS.find((x) => x.value === m)?.label ?? "—";

export interface SalePrefill {
  email?: string;
  name?: string;
  planId?: string;
}

type Form = {
  customer_name: string;
  email: string;
  plan_id: string;
  amount: string;
  paid_on: string;
  method: SubscriptionPaymentMethod | "";
  status: "confirmado" | "pendente";
  payment_ref: string;
  notes: string;
};

const blank = (): Form => ({
  customer_name: "",
  email: "",
  plan_id: "",
  amount: "",
  paid_on: brDateKey(new Date()),
  method: "pix",
  status: "confirmado",
  payment_ref: "",
  notes: "",
});

type Account = { state: "idle" | "checking" | "found" | "missing"; name?: string; plan?: string | null; planStatus?: string | null };

/**
 * "+ Registrar nova venda": registra o pagamento de uma assinatura recebida pelo WhatsApp.
 * Confirmado -> entra no faturamento e libera o plano (com vencimento). Pendente -> fica aguardando.
 * Tudo é validado de novo no banco (somente o proprietário, sem duplicidade, valores imutáveis).
 */
export function RegisterSaleDialog({
  open,
  onClose,
  prefill,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  prefill?: SalePrefill | null;
  onSaved?: (row: SubscriptionSaleRow) => void;
}) {
  const toast = useToast();
  const plans = useLoad(() => backend.getPlans(), [], ["settings"]);
  const active = (plans.data ?? []).filter((p) => p.is_active);
  const [form, setForm] = useState<Form>(blank);
  const [amountTouched, setAmountTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<Account>({ state: "idle" });
  const idem = useRef(uid());

  // Reinicia quando o formulário abre (nova chave = nova venda)
  const prefillKey = `${prefill?.email ?? ""}|${prefill?.name ?? ""}|${prefill?.planId ?? ""}`;
  useEffect(() => {
    if (!open) return;
    idem.current = uid();
    setForm({ ...blank(), email: prefill?.email ?? "", customer_name: prefill?.name ?? "", plan_id: prefill?.planId ?? "" });
    setAmountTouched(false);
    setErrors({});
    setAccount({ state: "idle" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillKey]);

  // Plano padrão e valor sugerido = preço do plano (pode ser alterado: desconto, valor combinado)
  useEffect(() => {
    if (!open || !active.length) return;
    setForm((f) => {
      const planId = f.plan_id && active.some((p) => p.id === f.plan_id) ? f.plan_id : active[0].id;
      const plan = active.find((p) => p.id === planId)!;
      const amount = amountTouched ? f.amount : moneyToInput(plan.price);
      return planId === f.plan_id && amount === f.amount ? f : { ...f, plan_id: planId, amount };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, plans.data, form.plan_id, amountTouched]);

  // Confere se existe conta com o e-mail (o banco confere de novo ao salvar)
  useEffect(() => {
    if (!open) return;
    const email = form.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAccount({ state: "idle" });
      return;
    }
    setAccount({ state: "checking" });
    let alive = true;
    const t = window.setTimeout(async () => {
      try {
        const rows = await backend.admin.listUsers(email);
        const u = rows.find((r) => r.email.toLowerCase() === email);
        if (!alive) return;
        if (!u) return setAccount({ state: "missing" });
        setAccount({ state: "found", name: u.full_name, plan: u.status === "ativa" ? u.plan_name : null, planStatus: u.status });
        setForm((f) => (f.customer_name.trim() ? f : { ...f, customer_name: u.full_name }));
      } catch {
        if (alive) setAccount({ state: "idle" });
      }
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [open, form.email]);

  const plan = active.find((p) => p.id === form.plan_id);
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const renewal = account.state === "found" && account.plan && plan && account.plan === plan.name;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const parsed = subscriptionSaleSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (account.state === "missing") return setErrors({ email: "Não existe conta com este e-mail. O cliente precisa se cadastrar no site primeiro." });
    setErrors({});
    setSaving(true);
    try {
      const row = await backend.admin.registerSubscriptionSale({ ...parsed.data, idempotency_key: idem.current });
      emit("status", "platform-sales");
      if (row.status === "confirmado") {
        toast.success(
          row.kind === "renovacao" ? "Venda registrada · plano renovado" : "Venda registrada · plano liberado",
          `${row.plan_name} para ${row.customer_email}${row.period_end ? ` até ${formatDate(row.period_end)}` : ""}.`,
        );
      } else {
        toast.success("Pagamento pendente registrado", "Ele não entra no faturamento. Confirme quando receber para liberar o plano.");
      }
      onSaved?.(row);
      onClose();
    } catch (err) {
      toast.error("Não foi possível registrar", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      size="lg"
      title="Registrar nova venda"
      description="Pagamento de assinatura recebido pelo WhatsApp. Vincule à conta do cliente."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="sale-form" loading={saving}>
            {form.status === "confirmado" ? "Confirmar venda e liberar plano" : "Registrar como pendente"}
          </Button>
        </>
      }
    >
      <form id="sale-form" onSubmit={submit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="E-mail da conta cadastrada" error={errors.email}>
            {(p) => (
              <Input
                {...p}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="cliente@email.com"
              />
            )}
          </Field>
          <Field label="Nome do cliente" error={errors.customer_name}>
            {(p) => <Input {...p} value={form.customer_name} onChange={(e) => set({ customer_name: e.target.value })} maxLength={120} />}
          </Field>
        </div>

        {account.state !== "idle" && (
          <p
            className={cn(
              "-mt-1 flex items-start gap-2 rounded-xl px-3 py-2 text-[13px] font-medium ring-1",
              account.state === "found" && "bg-income-soft text-income ring-income/20",
              account.state === "missing" && "bg-expense-soft text-expense ring-expense/20",
              account.state === "checking" && "bg-surface text-muted ring-line",
            )}
            role="status"
          >
            {account.state === "checking" && <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />}
            {account.state === "found" && <UserCheck className="mt-0.5 size-4 shrink-0" />}
            {account.state === "missing" && <UserX className="mt-0.5 size-4 shrink-0" />}
            <span>
              {account.state === "checking" && "Procurando a conta…"}
              {account.state === "found" && (
                <>
                  Conta encontrada: <strong>{account.name || "sem nome"}</strong>
                  {account.plan ? ` · plano atual: ${account.plan}` : " · sem plano ativo"}
                </>
              )}
              {account.state === "missing" && "Nenhuma conta com este e-mail. Peça para o cliente se cadastrar no site com este e-mail."}
            </span>
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Plano contratado" error={errors.plan_id}>
            {(p) => (
              <Select {...p} value={form.plan_id} onChange={(e) => set({ plan_id: e.target.value })}>
                {active.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name.replace(/^Plano\s+/i, "")} — {formatBRL(x.price)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Valor pago" error={errors.amount} hint={plan && amountTouched && moneyToInput(plan.price) !== form.amount ? `Preço do plano: ${formatBRL(plan.price)}` : undefined}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => {
                  setAmountTouched(true);
                  set({ amount: e.target.value });
                }}
                placeholder="R$ 0,00"
              />
            )}
          </Field>
          <Field label="Data do pagamento" error={errors.paid_on}>
            {(p) => <Input {...p} type="date" max={brDateKey(new Date())} value={form.paid_on} onChange={(e) => set({ paid_on: e.target.value })} />}
          </Field>
          <Field label="Forma de pagamento" error={errors.method}>
            {(p) => (
              <Select {...p} value={form.method} onChange={(e) => set({ method: e.target.value as Form["method"] })}>
                {SUBSCRIPTION_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">Status do pagamento</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
            {(
              [
                { value: "confirmado", icon: <CircleCheck />, title: "Confirmado", text: "Já recebi. Entra no faturamento e libera o plano agora." },
                { value: "pendente", icon: <Clock3 />, title: "Pendente", text: "Aguardando. Não conta no faturamento nem libera o plano." },
              ] as const
            ).map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={form.status === o.value}
                onClick={() => set({ status: o.value })}
                className={cn(
                  "flex items-start gap-3 rounded-xl p-3 text-left ring-1 transition [&_svg]:mt-0.5 [&_svg]:size-5 [&_svg]:shrink-0",
                  form.status === o.value
                    ? o.value === "confirmado"
                      ? "bg-income-soft text-income ring-2 ring-income/50"
                      : "bg-warn-soft text-warn ring-2 ring-warn/50"
                    : "bg-white text-muted ring-line hover:bg-surface",
                )}
              >
                {o.icon}
                <span>
                  <span className="block text-sm font-semibold text-ink">{o.title}</span>
                  <span className="block text-[12.5px]">{o.text}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="ID do Pix ou comprovante (opcional)" hint="Evita registrar o mesmo pagamento duas vezes.">
            {(p) => <Input {...p} value={form.payment_ref} onChange={(e) => set({ payment_ref: e.target.value })} maxLength={120} />}
          </Field>
          <Field label="Observações (opcional)">
            {(p) => <Textarea {...p} rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={500} />}
          </Field>
        </div>

        {plan && form.status === "confirmado" && (
          <p className="flex items-start gap-2 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[13px] text-brand-700 ring-1 ring-brand-100">
            <Info className="mt-0.5 size-4 shrink-0" />
            <span>
              {renewal
                ? `Renovação: ${plan.duration_months} ${plan.duration_months === 1 ? "mês somado" : "meses somados"} ao vencimento atual do cliente.`
                : `O ${plan.name} fica ativo por ${plan.duration_months} ${plan.duration_months === 1 ? "mês" : "meses"} a partir de hoje${account.plan ? ` (o ${account.plan} atual é substituído)` : ""}.`}{" "}
              O vencimento é calculado e salvo pelo servidor.
            </span>
          </p>
        )}
      </form>
    </Dialog>
  );
}
