"use client";

import { Ban, BadgeDollarSign, CalendarClock, Crown, Headset, History, Megaphone, Pause, Play, Plus, RotateCcw, Search, Send, Users } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorNote, Segmented, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { RegisterSaleDialog, type SalePrefill } from "@/components/admin/register-sale-dialog";
import { backend, friendlyError, type AdminSubscriptionRow, type AdminUserRow, type AuditRow, type HistoryAction, type Plan, type SubscriptionStatus } from "@/lib/data";
import { emit } from "@/lib/events";
import { useLoad } from "@/lib/hooks/use-load";
import { cn, daysUntil, formatBRL, formatDate, formatDateTime, moneyToInput } from "@/lib/utils";
import { fieldErrors, planIdSchema, planSchema, settingsSchema } from "@/lib/validation";

const statusTone = { ativa: "success", suspensa: "warn", cancelada: "neutral", vencida: "danger" } as const;
const statusLabel: Record<SubscriptionStatus, string> = { ativa: "Ativa", suspensa: "Suspensa", cancelada: "Cancelada", vencida: "Vencida" };

function Stat({ icon, label, value, tone = "brand" }: { icon: ReactNode; label: string; value: ReactNode; tone?: "brand" | "success" | "warn" }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-xl [&_svg]:size-5",
            tone === "brand" && "bg-brand-50 text-brand-600",
            tone === "success" && "bg-income-soft text-income",
            tone === "warn" && "bg-warn-soft text-warn",
          )}
        >
          {icon}
        </span>
        <p className="text-sm font-medium text-muted">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-extrabold tabular-nums">{value}</p>
    </Card>
  );
}

// ------------------------------------------------------------------ Visão geral
export function AdminOverviewTab() {
  const overview = useLoad(() => backend.admin.overview(), [], ["status"]);
  const payments = useLoad(() => backend.admin.listPayments(), [], ["status"]);
  const o = overview.data;
  return (
    <div className="space-y-6">
      {overview.error && <ErrorNote message={overview.error} onRetry={overview.reload} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Users />} label="Usuários cadastrados" value={o ? o.total_users : "—"} />
        <Stat icon={<Crown />} label="Assinaturas ativas" value={o ? o.active_subs : "—"} tone="success" />
        <Stat icon={<CalendarClock />} label="Vencem em 7 dias" value={o ? o.expiring_7d : "—"} tone="warn" />
        <Stat icon={<BadgeDollarSign />} label="Recebido no mês (confirmado)" value={o ? formatBRL(o.revenue_month) : "—"} tone="success" />
      </div>
      <Card>
        <CardHeader
          icon={<BadgeDollarSign />}
          title="Receitas de assinaturas registradas"
          description={o ? `Total registrado: ${formatBRL(o.revenue_total)}` : undefined}
        />
        <CardBody>
          {payments.loading ? (
            <Skeleton className="h-32" />
          ) : !payments.data?.length ? (
            <p className="py-6 text-center text-sm text-muted">Nenhum pagamento registrado ainda. Eles aparecem ao ativar ou renovar planos.</p>
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-2 pr-4">Data</th>
                    <th className="py-2 pr-4">Cliente</th>
                    <th className="py-2 pr-4">Plano</th>
                    <th className="py-2 pr-4">Tipo</th>
                    <th className="py-2 pr-4">Identificador</th>
                    <th className="py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {payments.data.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 pr-4 text-muted">{formatDateTime(p.created_at)}</td>
                      <td className="py-2.5 pr-4 font-medium">{p.email}</td>
                      <td className="py-2.5 pr-4">{p.plan_name}</td>
                      <td className="py-2.5 pr-4">
                        <Badge tone={p.kind === "ativacao" ? "brand" : "success"}>{p.kind === "ativacao" ? "Ativação" : "Renovação"}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-muted">{p.payment_ref || "—"}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums">{formatBRL(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Usuários
const historyLabel: Record<HistoryAction, { label: string; tone: "brand" | "success" | "warn" | "danger" | "neutral" }> = {
  ativacao: { label: "Ativação", tone: "success" },
  renovacao: { label: "Renovação", tone: "brand" },
  reativacao: { label: "Reativação", tone: "success" },
  suspensao: { label: "Suspensão", tone: "warn" },
  cancelamento: { label: "Cancelamento", tone: "danger" },
  vencimento: { label: "Vencimento", tone: "danger" },
  substituicao: { label: "Substituída", tone: "neutral" },
};

function HistoryDialog({ user, onClose }: { user: AdminUserRow | null; onClose: () => void }) {
  const history = useLoad(() => (user ? backend.admin.userHistory(user.user_id) : Promise.resolve([])), [user?.user_id], ["status"]);
  return (
    <Dialog open={Boolean(user)} onClose={onClose} title="Histórico de alterações" description={user ? `${user.full_name || "Cliente"} · ${user.email}` : undefined}>
      {history.error && <ErrorNote message={history.error} onRetry={history.reload} />}
      {history.loading ? (
        <Skeleton className="h-40" />
      ) : !history.data?.length ? (
        <EmptyState icon={<History />} title="Sem alterações registradas" description="Ativações, renovações, suspensões e cancelamentos aparecem aqui." />
      ) : (
        <ol className="relative space-y-4 border-l-2 border-line pl-5">
          {history.data.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[27px] top-1 size-3 rounded-full bg-brand-600 ring-4 ring-white" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={historyLabel[h.action]?.tone ?? "neutral"}>{historyLabel[h.action]?.label ?? h.action}</Badge>
                <span className="text-sm font-semibold">{h.plan_name ?? "—"}</span>
              </div>
              {h.details && <p className="mt-1 text-[13px] text-ink/80">{h.details}</p>}
              <p className="mt-0.5 text-xs text-muted">
                {formatDateTime(h.created_at)}
                {h.actor_email ? ` · por ${h.actor_email}` : " · automático"}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

/** Clientes: plano, ativação, vencimento, status e ações individuais (sempre com confirmação). */
export function AdminUsersTab() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [historyOf, setHistoryOf] = useState<AdminUserRow | null>(null);
  const [saleFor, setSaleFor] = useState<SalePrefill | null>(null);
  const [changing, setChanging] = useState<{ user: AdminUserRow; to: "ativa" | "suspensa" | "cancelada" } | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);
  const users = useLoad(() => backend.admin.listUsers(q), [q], ["status"]);

  const change = async () => {
    if (!changing?.user.subscription_id) return;
    try {
      await backend.admin.setSubscriptionStatus(changing.user.subscription_id, changing.to);
      emit("status");
      toast.success("Status atualizado", `${changing.user.email}: ${statusLabel[changing.to]}`);
    } catch (e) {
      toast.error("Não foi possível alterar", friendlyError(e));
      throw e;
    }
  };

  return (
    <Card>
      <CardHeader
        icon={<Users />}
        title="Clientes"
        description="Planos são ativados individualmente, somente após a confirmação do pagamento."
        action={
          <Button size="sm" onClick={() => setSaleFor({})}>
            <Plus /> Registrar nova venda
          </Button>
        }
      />
      <CardBody>
        <div className="mb-4">
          <Input icon={<Search />} placeholder="Pesquisar por e-mail ou nome…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Pesquisar clientes" />
        </div>
        {users.error && <ErrorNote message={users.error} onRetry={users.reload} />}
        {users.loading ? (
          <Skeleton className="h-40" />
        ) : !users.data?.length ? (
          <EmptyState icon={<Users />} title="Nenhum cliente encontrado" />
        ) : (
          <>
            <div className="hidden grid-cols-[1.7fr_1.1fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wide text-muted lg:grid">
              <span>Cliente</span>
              <span>Plano</span>
              <span>Ativação</span>
              <span>Vencimento</span>
              <span>Status</span>
            </div>
            <ul className="divide-y divide-line">
              {users.data.map((u) => {
                const hasSub = Boolean(u.subscription_id && u.status);
                const left = u.expires_at ? daysUntil(u.expires_at) : null;
                return (
                  <li key={u.user_id} className="py-4">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1.1fr_0.8fr_0.8fr_0.8fr] lg:items-center lg:gap-4">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {u.full_name || "Sem nome"} {u.is_admin && <Badge tone="brand">Proprietário</Badge>}
                        </p>
                        <p className="truncate text-[13px] text-muted">
                          {u.email}
                          {!u.email_confirmed && " · e-mail não confirmado"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="text-xs font-semibold uppercase text-muted lg:hidden">Plano:</span>
                        <span className="font-medium">{u.plan_name ?? "Gratuito"}</span>
                        {u.priority_support && (
                          <Badge tone="warn">
                            <Headset /> Suporte prioritário
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">
                        <span className="text-xs font-semibold uppercase text-muted lg:hidden">Ativação: </span>
                        {u.started_at ? formatDate(u.started_at) : "—"}
                      </p>
                      <p className="text-sm">
                        <span className="text-xs font-semibold uppercase text-muted lg:hidden">Vencimento: </span>
                        {u.expires_at ? formatDate(u.expires_at) : "—"}
                        {u.status === "ativa" && left !== null && left >= 0 && (
                          <span className={cn("ml-1 text-xs font-semibold", left <= 3 ? "text-warn" : "text-muted")}>({left} d)</span>
                        )}
                      </p>
                      <div>{u.status ? <Badge tone={statusTone[u.status]}>{statusLabel[u.status]}</Badge> : <Badge>Gratuito</Badge>}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button size="sm" onClick={() => setSaleFor({ email: u.email, name: u.full_name })}>
                        <Crown /> Ativar plano
                      </Button>
                      {hasSub && u.status !== "cancelada" && (
                        <Button size="sm" variant="secondary" onClick={() => setSaleFor({ email: u.email, name: u.full_name, planId: u.plan_id ?? undefined })}>
                          <RotateCcw /> Renovar plano
                        </Button>
                      )}
                      {u.status === "ativa" && (
                        <Button size="sm" variant="secondary" onClick={() => setChanging({ user: u, to: "suspensa" })}>
                          <Pause /> Suspender plano
                        </Button>
                      )}
                      {u.status === "suspensa" && u.expires_at && new Date(u.expires_at) > new Date() && (
                        <Button size="sm" variant="secondary" onClick={() => setChanging({ user: u, to: "ativa" })}>
                          <Play /> Reativar
                        </Button>
                      )}
                      {hasSub && u.status !== "cancelada" && (
                        <Button size="sm" variant="ghost" className="text-expense hover:text-expense" onClick={() => setChanging({ user: u, to: "cancelada" })}>
                          <Ban /> Cancelar plano
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setHistoryOf(u)}>
                        <History /> Histórico
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardBody>
      <HistoryDialog user={historyOf} onClose={() => setHistoryOf(null)} />
      <RegisterSaleDialog open={Boolean(saleFor)} prefill={saleFor} onClose={() => setSaleFor(null)} />
      <ConfirmDialog
        open={Boolean(changing)}
        onClose={() => setChanging(null)}
        onConfirm={change}
        danger={changing?.to !== "ativa"}
        title={changing?.to === "ativa" ? "Reativar plano?" : changing?.to === "suspensa" ? "Suspender plano?" : "Cancelar plano?"}
        description={
          changing?.to === "cancelada"
            ? `${changing.user.email} volta ao plano gratuito. Para ter um plano de novo, será preciso uma nova ativação.`
            : changing?.to === "suspensa"
              ? `${changing.user.email} perde os recursos do plano até a reativação.`
              : "Os recursos do plano voltam até a data de vencimento."
        }
        confirmLabel="Confirmar"
      />
    </Card>
  );
}

// ------------------------------------------------------------------ Assinaturas
export function AdminSubscriptionsTab() {
  const toast = useToast();
  const [status, setStatus] = useState<"" | SubscriptionStatus>("");
  const subs = useLoad(() => backend.admin.listSubscriptions(status), [status], ["status"]);
  const [saleFor, setSaleFor] = useState<SalePrefill | null>(null);
  const [changing, setChanging] = useState<{ sub: AdminSubscriptionRow; to: "ativa" | "suspensa" | "cancelada" } | null>(null);

  const change = async () => {
    if (!changing) return;
    try {
      await backend.admin.setSubscriptionStatus(changing.sub.id, changing.to);
      emit("status");
      toast.success("Status atualizado", `${changing.sub.email}: ${statusLabel[changing.to]}`);
    } catch (e) {
      toast.error("Não foi possível alterar", friendlyError(e));
      throw e;
    }
  };

  return (
    <Card>
      <CardHeader icon={<Crown />} title="Assinaturas" description="Ordenadas pelo vencimento mais próximo." />
      <CardBody>
        <div className="mb-4">
          <Segmented
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "Todas" },
              { value: "ativa", label: "Ativas" },
              { value: "suspensa", label: "Suspensas" },
              { value: "vencida", label: "Vencidas" },
              { value: "cancelada", label: "Canceladas" },
            ]}
          />
        </div>
        {subs.error && <ErrorNote message={subs.error} onRetry={subs.reload} />}
        {subs.loading ? (
          <Skeleton className="h-40" />
        ) : !subs.data?.length ? (
          <EmptyState icon={<Crown />} title="Nenhuma assinatura" description="Ative planos na aba Usuários." />
        ) : (
          <ul className="divide-y divide-line">
            {subs.data.map((s) => {
              const left = daysUntil(s.expires_at);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.email}</p>
                    <p className="text-[12.5px] text-muted">
                      {s.plan_name} · {formatBRL(s.price)} · início {formatDate(s.started_at)} · vence {formatDate(s.expires_at)}
                      {s.status === "ativa" && left >= 0 && (
                        <span className={cn("ml-1 font-semibold", left <= 3 ? "text-warn" : "")}>({left} dia(s))</span>
                      )}
                      {s.payment_ref && ` · ref. ${s.payment_ref}`}
                    </p>
                  </div>
                  <Badge tone={statusTone[s.status]}>{statusLabel[s.status]}</Badge>
                  <div className="flex flex-wrap gap-1.5">
                    {s.status !== "cancelada" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSaleFor({ email: s.email, name: s.full_name, planId: s.plan_id })}
                      >
                        <RotateCcw /> Renovar
                      </Button>
                    )}
                    {s.status === "ativa" && (
                      <Button size="sm" variant="ghost" onClick={() => setChanging({ sub: s, to: "suspensa" })}>
                        Suspender
                      </Button>
                    )}
                    {s.status === "suspensa" && new Date(s.expires_at) > new Date() && (
                      <Button size="sm" variant="ghost" onClick={() => setChanging({ sub: s, to: "ativa" })}>
                        Reativar
                      </Button>
                    )}
                    {s.status !== "cancelada" && (
                      <Button size="sm" variant="ghost" className="text-expense hover:text-expense" onClick={() => setChanging({ sub: s, to: "cancelada" })}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>

      <RegisterSaleDialog open={Boolean(saleFor)} prefill={saleFor} onClose={() => setSaleFor(null)} />

      <ConfirmDialog
        open={Boolean(changing)}
        onClose={() => setChanging(null)}
        onConfirm={change}
        danger={changing?.to !== "ativa"}
        title={changing?.to === "ativa" ? "Reativar assinatura?" : changing?.to === "suspensa" ? "Suspender assinatura?" : "Cancelar assinatura?"}
        description={
          changing?.to === "cancelada"
            ? "O cliente volta ao plano gratuito. Para voltar a ter um plano, será preciso uma nova ativação."
            : changing?.to === "suspensa"
              ? "O cliente perde o acesso ilimitado até a assinatura ser reativada."
              : "O acesso ilimitado volta até a data de vencimento."
        }
        confirmLabel="Confirmar"
      />
    </Card>
  );
}

// ------------------------------------------------------------------ Planos
type PlanForm = {
  id: string;
  name: string;
  description: string;
  price: string;
  billing_period: "mensal" | "anual";
  duration_months: string;
  features: string;
  highlight: string;
  is_active: boolean;
  unlimited: boolean;
  daily_limit_hours: string;
  allow_push: boolean;
  allow_reminders: boolean;
  priority_support: boolean;
  featured: boolean;
  compare_to_plan_id: string;
};

const slugify = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const planToForm = (plan: Plan | null): PlanForm => ({
  id: plan?.id ?? "",
  name: plan?.name ?? "",
  description: plan?.description ?? "Cobrança mensal",
  price: plan ? moneyToInput(plan.price) : "",
  billing_period: plan?.billing_period ?? "mensal",
  duration_months: String(plan?.duration_months ?? 1),
  features: plan?.features.join("\n") ?? "",
  highlight: plan?.highlight ?? "",
  is_active: plan?.is_active ?? true,
  unlimited: plan ? plan.daily_limit_seconds == null : true,
  daily_limit_hours: plan?.daily_limit_seconds ? String(plan.daily_limit_seconds / 3600).replace(".", ",") : "10",
  allow_push: plan?.allow_push ?? true,
  allow_reminders: plan?.allow_reminders ?? false,
  priority_support: plan?.priority_support ?? false,
  featured: plan?.featured ?? false,
  compare_to_plan_id: plan?.compare_to_plan_id ?? "",
});

function Check2({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface px-3.5 py-2.5 text-sm ring-1 ring-line">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="block text-[12.5px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function PlanEditor({ plan, plans, onCreated }: { plan: Plan | null; plans: Plan[]; onCreated?: () => void }) {
  const toast = useToast();
  const creating = !plan;
  const [form, setForm] = useState<PlanForm>(() => planToForm(plan));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<PlanForm>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = planSchema.safeParse({
      ...form,
      daily_limit_hours: form.unlimited ? "1" : form.daily_limit_hours,
      features: form.features
        .split("\n")
        .map((f) => f.trim())
        .filter(Boolean),
    });
    const idParsed = creating ? planIdSchema.safeParse(form.id || slugify(form.name)) : null;
    if (!parsed.success || (idParsed && !idParsed.success)) {
      return setErrors({ ...(parsed.success ? {} : fieldErrors(parsed.error)), ...(idParsed && !idParsed.success ? { id: idParsed.error.issues[0].message } : {}) });
    }
    setErrors({});
    setSaving(true);
    const { unlimited, daily_limit_hours, ...rest } = parsed.data;
    const payload = { ...rest, daily_limit_seconds: unlimited ? null : Math.round(daily_limit_hours * 3600) };
    try {
      if (creating) {
        await backend.admin.createPlan({ ...payload, id: idParsed!.success ? idParsed!.data : "", sort_order: Math.max(0, ...plans.map((p) => p.sort_order)) + 1 });
        toast.success("Plano criado", `${payload.name}. Nenhum cliente foi ativado automaticamente.`);
        setForm(planToForm(null));
        onCreated?.();
      } else {
        await backend.admin.updatePlan(plan.id, payload);
        toast.success("Plano atualizado", `${payload.name}. As assinaturas dos clientes não foram alteradas.`);
      }
      emit("settings");
    } catch (err) {
      toast.error("Não foi possível salvar", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  const others = plans.filter((p) => p.id !== plan?.id);

  return (
    <Card className={cn(creating && "ring-2 ring-brand-200")}>
      <form onSubmit={submit} className="space-y-4 p-5 sm:p-6" noValidate>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{creating ? "Novo plano" : `id: ${plan.id}`}</p>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={form.is_active} onChange={(e) => set({ is_active: e.target.checked })} className="size-4 accent-brand-600" />
            Ativo (aparece na página de planos)
          </label>
        </div>
        <Field label="Nome" error={errors.name}>
          {(p) => <Input {...p} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Plano Semestral" />}
        </Field>
        {creating && (
          <Field label="Identificador" error={errors.id} hint="Usado internamente. Não pode ser alterado depois.">
            {(p) => <Input {...p} value={form.id} onChange={(e) => set({ id: e.target.value })} placeholder={slugify(form.name) || "plano-semestral"} />}
          </Field>
        )}
        <Field label="Descrição" error={errors.description}>
          {(p) => <Input {...p} value={form.description} onChange={(e) => set({ description: e.target.value })} />}
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Preço (R$)" error={errors.price}>
            {(p) => <Input {...p} inputMode="decimal" value={form.price} onChange={(e) => set({ price: e.target.value })} />}
          </Field>
          <Field label="Cobrança" error={errors.billing_period}>
            {(p) => (
              <Select {...p} value={form.billing_period} onChange={(e) => set({ billing_period: e.target.value as PlanForm["billing_period"] })}>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </Select>
            )}
          </Field>
          <Field label="Duração (meses)" error={errors.duration_months}>
            {(p) => <Input {...p} inputMode="numeric" value={form.duration_months} onChange={(e) => set({ duration_months: e.target.value.replace(/\D/g, "") })} />}
          </Field>
        </div>

        <div className="rounded-2xl p-4 ring-1 ring-line">
          <p className="mb-3 text-sm font-semibold">Limite diário de uso</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px] sm:items-start">
            <Check2 checked={form.unlimited} onChange={(v) => set({ unlimited: v })} label="Sem limite diário" />
            {!form.unlimited && (
              <Field error={errors.daily_limit_hours}>
                {(p) => <Input {...p} inputMode="decimal" value={form.daily_limit_hours} onChange={(e) => set({ daily_limit_hours: e.target.value })} aria-label="Horas por dia" placeholder="Horas/dia" />}
              </Field>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Funcionalidades do plano</p>
          <Check2 checked={form.allow_push} onChange={(v) => set({ allow_push: v })} label="Notificações no celular e computador" hint="Estoque, vendas, vencimento, comunicados" />
          <Check2 checked={form.allow_reminders} onChange={(v) => set({ allow_reminders: v })} label="Meus Lembretes" hint="Lembretes personalizados de pagamentos e compras" />
          <Check2 checked={form.priority_support} onChange={(v) => set({ priority_support: v })} label="Suporte prioritário" hint="Marcado na lista de clientes para atendimento humano" />
        </div>

        <Field label="Benefícios (um por linha)" error={errors.features} hint="Aparecem no card do plano. Inclua apenas benefícios confirmados.">
          {(p) => <Textarea {...p} rows={5} value={form.features} onChange={(e) => set({ features: e.target.value })} />}
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Selo (opcional)" error={errors.highlight}>
            {(p) => <Input {...p} value={form.highlight} onChange={(e) => set({ highlight: e.target.value })} placeholder="Ex.: Mais popular" />}
          </Field>
          <Field label="Mostrar economia em relação a" hint="Ex.: anual comparado ao mensal">
            {(p) => (
              <Select {...p} value={form.compare_to_plan_id} onChange={(e) => set({ compare_to_plan_id: e.target.value })}>
                <option value="">Não mostrar</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Check2 checked={form.featured} onChange={(v) => set({ featured: v })} label="Destacar visualmente (borda azul)" />
        <Button type="submit" loading={saving} className="w-full">
          {creating ? "Criar plano" : "Salvar plano"}
        </Button>
        <p className="text-center text-xs text-muted">Salvar não ativa este plano para nenhum cliente. A ativação é individual, na aba Clientes.</p>
      </form>
    </Card>
  );
}

export function AdminPlansTab() {
  const plans = useLoad(() => backend.getPlans(), [], ["settings"]);
  const [creating, setCreating] = useState(false);
  if (plans.error) return <ErrorNote message={plans.error} onRetry={plans.reload} />;
  if (plans.loading || !plans.data) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Preços, duração, limites, funcionalidades e benefícios de cada plano.</p>
        <Button variant={creating ? "secondary" : "primary"} onClick={() => setCreating((c) => !c)}>
          {creating ? "Fechar" : <><Plus /> Novo plano</>}
        </Button>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {creating && <PlanEditor key="novo" plan={null} plans={plans.data} onCreated={() => setCreating(false)} />}
        {plans.data.map((p) => (
          <PlanEditor key={`${p.id}-${p.sort_order}`} plan={p} plans={plans.data!} />
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Configurações
export function AdminSettingsTab() {
  const toast = useToast();
  const settings = useLoad(() => backend.getSettings(), []);
  const [form, setForm] = useState({
    whatsapp_number: "",
    support_email: "",
    instagram_url: "",
    satisfied_clients_value: "120",
    satisfied_clients_is_demo: true,
    free_daily_hours: "1",
    expiry_notice_days: "3",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = settings.data;
    if (s)
      setForm({
        whatsapp_number: s.whatsapp_number ?? "",
        support_email: s.support_email ?? "",
        instagram_url: s.instagram_url ?? "",
        satisfied_clients_value: String(s.satisfied_clients_value),
        satisfied_clients_is_demo: s.satisfied_clients_is_demo,
        free_daily_hours: String(s.free_daily_seconds / 3600).replace(".", ","),
        expiry_notice_days: String(s.expiry_notice_days),
      });
  }, [settings.data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = settingsSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSaving(true);
    try {
      const { free_daily_hours, ...rest } = parsed.data;
      await backend.admin.updateSettings({ ...rest, free_daily_seconds: Math.round(free_daily_hours * 3600) });
      emit("settings", "status");
      toast.success("Configurações salvas");
    } catch (err) {
      toast.error("Não foi possível salvar", friendlyError(err));
    } finally {
      setSaving(false);
    }
  };

  if (settings.loading) return <Skeleton className="h-96" />;
  return (
    <Card>
      <CardHeader title="Configurações da plataforma" description="Contato, indicadores e regras de uso." />
      <CardBody>
        {settings.error && <ErrorNote message={settings.error} onRetry={settings.reload} />}
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          <Field label="WhatsApp (assinaturas e suporte)" error={errors.whatsapp_number} hint="Com DDI e DDD, só números. Oficial: 5511959311513">
            {(p) => <Input {...p} inputMode="tel" value={form.whatsapp_number} onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })} placeholder="55 + DDD + número" />}
          </Field>
          <Field label="Instagram" error={errors.instagram_url} hint="Ex.: @seuperfil. Vazio = o botão não aparece no rodapé.">
            {(p) => <Input {...p} value={form.instagram_url} onChange={(e) => setForm({ ...form, instagram_url: e.target.value })} placeholder="https://www.instagram.com/seuperfil" />}
          </Field>
          <Field label="E-mail de suporte" error={errors.support_email} hint="Aparece no rodapé (link mailto:).">
            {(p) => <Input {...p} type="email" value={form.support_email} onChange={(e) => setForm({ ...form, support_email: e.target.value })} placeholder="suporte@seudominio.com" />}
          </Field>
          <Field label="Indicador “Clientes satisfeitos”" error={errors.satisfied_clients_value}>
            {(p) => <Input {...p} inputMode="numeric" value={form.satisfied_clients_value} onChange={(e) => setForm({ ...form, satisfied_clients_value: e.target.value.replace(/\D/g, "") })} />}
          </Field>
          <div className="flex items-end">
            <label className="flex items-start gap-3 rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-line">
              <input
                type="checkbox"
                checked={form.satisfied_clients_is_demo}
                onChange={(e) => setForm({ ...form, satisfied_clients_is_demo: e.target.checked })}
                className="mt-0.5 size-4 accent-brand-600"
              />
              <span>
                Exibir como <strong>demonstrativo</strong>. Desmarque somente quando o número for real e verificável.
              </span>
            </label>
          </div>
          <Field label="Tempo gratuito por dia (horas)" error={errors.free_daily_hours}>
            {(p) => <Input {...p} inputMode="decimal" value={form.free_daily_hours} onChange={(e) => setForm({ ...form, free_daily_hours: e.target.value })} />}
          </Field>
          <Field label="Avisar vencimento com antecedência de (dias)" error={errors.expiry_notice_days}>
            {(p) => <Input {...p} inputMode="numeric" value={form.expiry_notice_days} onChange={(e) => setForm({ ...form, expiry_notice_days: e.target.value.replace(/\D/g, "") })} />}
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" loading={saving}>
              Salvar configurações
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------ Comunicados
export function AdminBroadcastTab() {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirm, setConfirm] = useState(false);
  const send = async () => {
    try {
      const n = await backend.admin.broadcast(title, body);
      emit("notifications");
      toast.success("Comunicado enviado", `${n} usuário(s) notificados.`);
      setTitle("");
      setBody("");
    } catch (e) {
      toast.error("Não foi possível enviar", friendlyError(e));
      throw e;
    }
  };
  return (
    <Card>
      <CardHeader icon={<Megaphone />} title="Comunicados" description="Envie um aviso para o sino de notificações de todos os usuários." />
      <CardBody className="space-y-4">
        <Field label="Título">{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />}</Field>
        <Field label="Mensagem">{(p) => <Textarea {...p} rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={400} />}</Field>
        <Button onClick={() => setConfirm(true)} disabled={!title.trim() || !body.trim()}>
          <Send /> Enviar para todos
        </Button>
      </CardBody>
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={send}
        danger={false}
        title="Enviar comunicado?"
        description="Todos os usuários receberão esta mensagem nas notificações."
        confirmLabel="Enviar"
      />
    </Card>
  );
}

// ------------------------------------------------------------------ Registro de operações
const auditTone = (action: string): "success" | "warn" | "danger" | "brand" | "neutral" =>
  /confirmado|ativada|registrada|criado/.test(action) ? "success" : /estornado|cancelad|excluida|cancelado/.test(action) ? "danger" : /suspensa|pendente/.test(action) ? "warn" : /alterad|renovada|comunicado/.test(action) ? "brand" : "neutral";

export function AdminAuditTab() {
  const audit = useLoad<AuditRow[]>(() => backend.admin.listAudit(300), [], ["status", "platform-sales", "settings"]);
  return (
    <Card>
      <CardHeader
        icon={<History />}
        title="Registro de operações"
        description="Vendas, confirmações, estornos, planos, assinaturas, configurações e despesas. Somente leitura: nada pode ser editado ou apagado."
      />
      <CardBody>
        {audit.error && <ErrorNote message={audit.error} onRetry={audit.reload} />}
        {audit.loading && !audit.data ? (
          <Skeleton className="h-40" />
        ) : !audit.data?.length ? (
          <EmptyState icon={<History />} title="Nenhuma operação registrada ainda" />
        ) : (
          <ol className="divide-y divide-line">
            {audit.data.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4">
                <span className="w-36 shrink-0 text-[12.5px] tabular-nums text-muted">{formatDateTime(a.created_at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{a.summary}</p>
                  <p className="mt-0.5 text-xs text-muted">por {a.actor_email ?? "sistema"}</p>
                </div>
                <Badge tone={auditTone(a.action)} className="self-start">
                  {a.action.replace(/_/g, " ")}
                </Badge>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
