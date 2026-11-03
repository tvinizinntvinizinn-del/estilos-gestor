"use client";

import {
  BadgeDollarSign,
  Ban,
  CalendarRange,
  ChartLine,
  CircleCheck,
  Crown,
  Download,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RegisterSaleDialog, methodLabel } from "@/components/admin/register-sale-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorNote, PageHeader, Segmented, Skeleton } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { backend, friendlyError, type ExpenseCategory, type IsoRange, type PaymentStatus, type SubscriptionSaleRow, type Transaction } from "@/lib/data";
import { emit } from "@/lib/events";
import { PERIOD_OPTIONS, buildSeries, periodRange, type PeriodKey, type SeriesPoint } from "@/lib/finance";
import { useLoad } from "@/lib/hooks/use-load";
import { brDateKey, brMidnight, cn, downloadText, formatBRL, formatBRLCompact, formatDate, formatInt, toCsv } from "@/lib/utils";
import { fieldErrors, platformExpenseSchema } from "@/lib/validation";

type Period = PeriodKey | "tudo";
const PERIODS: Array<{ value: Period; label: string }> = [{ value: "tudo", label: "Todo o período" }, ...PERIOD_OPTIONS];

const STATUS: Record<PaymentStatus, { label: string; tone: "success" | "warn" | "neutral" | "danger" }> = {
  confirmado: { label: "Confirmado", tone: "success" },
  pendente: { label: "Pendente", tone: "warn" },
  cancelado: { label: "Cancelado", tone: "neutral" },
  estornado: { label: "Estornado", tone: "danger" },
};

export const EXPENSE_CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "hospedagem", label: "Hospedagem" },
  { value: "dominio", label: "Domínio" },
  { value: "ferramentas", label: "Ferramentas" },
  { value: "marketing", label: "Marketing" },
  { value: "impostos", label: "Impostos e taxas" },
  { value: "outros", label: "Outros" },
];
const categoryLabel = (c: string) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

// ------------------------------------------------------------------ Cards principais
function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
  loading,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone: "brand" | "success" | "navy" | "profit" | "loss";
  loading?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-2xl [&_svg]:size-[22px]",
            tone === "brand" && "bg-brand-50 text-brand-600",
            tone === "success" && "bg-income-soft text-income",
            tone === "navy" && "bg-navy-900 text-white",
            tone === "profit" && "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_8px_18px_-8px_rgb(16_185_129/0.8)]",
            tone === "loss" && "bg-expense-soft text-expense",
          )}
        >
          {icon}
        </span>
        <p className="text-sm font-medium leading-tight text-muted">{label}</p>
      </div>
      {loading ? (
        <span className="skeleton mt-4 block h-8 w-32 rounded-lg" />
      ) : (
        <p className={cn("mt-3 truncate text-[28px] font-extrabold tracking-tight tabular-nums", tone === "loss" ? "text-expense" : "text-ink")}>{value}</p>
      )}
      {sub && <p className="mt-1 text-[12.5px] text-muted">{sub}</p>}
    </Card>
  );
}

// ------------------------------------------------------------------ Gráfico (receitas x despesas da plataforma)
const COLORS = { receita: "#2563EB", despesa: "#EF4444", grid: "#E3E9F2", axis: "#5B6B82" };

function RevenueTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: SeriesPoint }> }) {
  if (!active || !payload?.length || !payload[0].payload) return null;
  const p = payload[0].payload;
  return (
    <div className="min-w-[200px] rounded-xl bg-white px-3.5 py-3 text-sm shadow-lift ring-1 ring-line">
      <p className="mb-2 text-xs font-semibold text-muted">{p.fullLabel}</p>
      <p className="flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: COLORS.receita }} />
        <span className="text-muted">Receitas</span>
        <span className="ml-auto font-semibold tabular-nums">{formatBRL(p.entradas)}</span>
      </p>
      <p className="mt-1 flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ background: COLORS.despesa }} />
        <span className="text-muted">Despesas</span>
        <span className="ml-auto font-semibold tabular-nums">{formatBRL(p.saidas)}</span>
      </p>
      <p className="mt-1.5 flex items-center gap-2 border-t border-line pt-1.5">
        <span className="w-2.5" />
        <span className="text-muted">Lucro</span>
        <span className={cn("ml-auto font-bold tabular-nums", p.saldo < 0 && "text-expense")}>{formatBRL(p.saldo)}</span>
      </p>
    </div>
  );
}

function RevenueChart({ data }: { data: SeriesPoint[] }) {
  const tick = { fill: COLORS.axis, fontSize: 12 };
  return (
    <div style={{ height: 280 }} className="w-full" role="img" aria-label="Gráfico da evolução das receitas de assinaturas e das despesas da plataforma">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} tickMargin={10} minTickGap={18} />
          <YAxis tickLine={false} axisLine={false} tick={tick} tickFormatter={(v: number) => formatBRLCompact(v)} width={72} />
          <Tooltip content={<RevenueTooltip />} cursor={{ stroke: "#93b8fd", strokeWidth: 1 }} />
          <Line type="monotone" dataKey="entradas" name="Receitas" stroke={COLORS.receita} strokeWidth={2.5} dot={data.length <= 2 ? { r: 4 } : false} animationDuration={700} />
          <Line type="monotone" dataKey="saidas" name="Despesas" stroke={COLORS.despesa} strokeWidth={2} strokeDasharray="7 4" dot={data.length <= 2 ? { r: 4 } : false} animationDuration={700} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------------ Despesas da plataforma
function ExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const empty = { description: "", category: "hospedagem" as ExpenseCategory, amount: "", spent_on: brDateKey(new Date()), notes: "" };
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const parsed = platformExpenseSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setSaving(true);
    try {
      await backend.admin.createExpense(parsed.data);
      emit("platform-sales");
      toast.success("Despesa registrada", `${parsed.data.description}: ${formatBRL(parsed.data.amount)}`);
      setForm(empty);
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
      title="Registrar despesa da plataforma"
      description="Custos do seu negócio de assinaturas (não confundir com os dados dos clientes)."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form="expense-form" loading={saving}>
            Registrar despesa
          </Button>
        </>
      }
    >
      <form id="expense-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Descrição" error={errors.description}>
          {(p) => <Input {...p} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: Hospedagem do site" maxLength={120} />}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Categoria">
            {(p) => (
              <Select {...p} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Valor" error={errors.amount}>
            {(p) => <Input {...p} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="R$ 0,00" />}
          </Field>
          <Field label="Data" error={errors.spent_on}>
            {(p) => <Input {...p} type="date" max={brDateKey(new Date())} value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} />}
          </Field>
        </div>
        <Field label="Observações (opcional)">
          {(p) => <Textarea {...p} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={500} />}
        </Field>
      </form>
    </Dialog>
  );
}

// ------------------------------------------------------------------ Página
export function SalesDashboard() {
  const toast = useToast();
  const today = brDateKey(new Date());
  const [period, setPeriod] = useState<Period>("tudo");
  const [custom, setCustom] = useState({ from: today.slice(0, 8) + "01", to: today });
  const [statusFilter, setStatusFilter] = useState<"" | PaymentStatus>("");
  const [search, setSearch] = useState("");
  const [registering, setRegistering] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [refunding, setRefunding] = useState<SubscriptionSaleRow | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundSaving, setRefundSaving] = useState(false);
  const [canceling, setCanceling] = useState<SubscriptionSaleRow | null>(null);
  const [confirming, setConfirming] = useState<SubscriptionSaleRow | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<{ id: string; description: string } | null>(null);

  const range = useMemo(() => (period === "tudo" ? null : periodRange(period, custom)), [period, custom]);
  const iso: IsoRange = { from: range ? range.from.toISOString() : null, to: range ? range.to.toISOString() : null };
  const topics = ["platform-sales", "status"] as const;
  const report = useLoad(() => backend.admin.salesReport(iso), [iso.from, iso.to], [...topics]);
  const sales = useLoad(() => backend.admin.listSubscriptionSales(iso), [iso.from, iso.to], [...topics]);
  const expenses = useLoad(() => backend.admin.listExpenses(iso), [iso.from, iso.to], [...topics]);
  const r = report.data;

  // Série do gráfico: receitas confirmadas x despesas, no mesmo formato dos gráficos (sem dados inventados)
  const series = useMemo(() => {
    const rows = sales.data ?? [];
    const exps = expenses.data ?? [];
    const flows = [
      ...rows.filter((s) => s.status === "confirmado").map((s) => ({ type: "entrada", amount: s.amount, occurred_at: s.paid_at })),
      ...exps.map((e) => ({ type: "saida", amount: e.amount, occurred_at: brMidnight(e.spent_on).toISOString() })),
    ] as unknown as Transaction[];
    let chartRange = range;
    if (!chartRange) {
      const first = flows.reduce((min, f) => (f.occurred_at < min ? f.occurred_at : min), new Date().toISOString());
      const from = brMidnight(brDateKey(new Date(first)).slice(0, 8) + "01");
      const days = (Date.now() - from.getTime()) / 86_400_000;
      chartRange = { from, to: new Date(), granularity: days <= 62 ? "day" : "month" };
    }
    return buildSeries(flows, chartRange);
  }, [sales.data, expenses.data, range]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (sales.data ?? []).filter(
      (s) =>
        (!statusFilter || s.status === statusFilter) &&
        (!q || s.customer_email.toLowerCase().includes(q) || s.customer_name.toLowerCase().includes(q) || (s.payment_ref ?? "").toLowerCase().includes(q)),
    );
  }, [sales.data, statusFilter, search]);

  const exportCsv = () => {
    const header = ["Data do pagamento", "Cliente", "E-mail", "Plano", "Valor pago (R$)", "Forma de pagamento", "Status", "Tipo", "Vencimento", "ID do pagamento", "Observações"];
    const rows = filtered.map((s) => [
      formatDate(s.paid_at),
      s.customer_name,
      s.customer_email,
      s.plan_name ?? s.plan_id,
      s.amount,
      methodLabel(s.method),
      STATUS[s.status].label,
      s.kind === "renovacao" ? "Renovação" : s.kind === "ativacao" ? "Nova assinatura" : "",
      s.period_end ? formatDate(s.period_end) : "",
      s.payment_ref ?? "",
      [s.notes, s.status_reason].filter(Boolean).join(" · "),
    ]);
    const label = period === "tudo" ? "todo-periodo" : period === "custom" ? `${custom.from}_a_${custom.to}` : period;
    downloadText(`estilos-gestor-vendas-${label}.csv`, toCsv(header, rows));
    toast.success("Relatório exportado", `${filtered.length} ${filtered.length === 1 ? "venda" : "vendas"} em CSV.`);
  };

  const run = async (fn: () => Promise<void>, ok: string, detail?: string) => {
    try {
      await fn();
      emit("platform-sales", "status");
      toast.success(ok, detail);
    } catch (e) {
      toast.error("Não foi possível concluir", friendlyError(e));
      throw e;
    }
  };

  const refund = async () => {
    if (!refunding) return;
    setRefundSaving(true);
    try {
      await run(() => backend.admin.refundPayment(refunding.id, refundReason), "Pagamento estornado", "O valor saiu do faturamento. O plano do cliente não foi alterado.");
      setRefunding(null);
    } catch {
      /* já avisado */
    } finally {
      setRefundSaving(false);
    }
  };

  const loading = report.loading && !r;

  return (
    <div>
      <PageHeader
        title="Minhas Vendas"
        description="Vendas de assinaturas, faturamento e lucro da plataforma. Somente você vê esta área."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={!filtered.length}>
              <Download /> Exportar CSV
            </Button>
            <Button onClick={() => setRegistering(true)}>
              <Plus /> Registrar nova venda
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented value={period} onChange={setPeriod} options={PERIODS} size="sm" />
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <CalendarRange className="hidden size-4 text-muted sm:block" />
            <Input type="date" aria-label="Data inicial" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-10 w-auto" />
            <span className="text-sm text-muted">até</span>
            <Input type="date" aria-label="Data final" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-10 w-auto" />
          </div>
        )}
      </div>

      {report.error && <ErrorNote message={report.error} onRetry={report.reload} />}

      <section aria-label="Indicadores de vendas" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<ShoppingBag />}
          tone="brand"
          label="Vendas realizadas"
          loading={loading}
          value={r ? formatInt(r.sales_count) : "0"}
          sub={r ? `${r.new_customers} ${r.new_customers === 1 ? "cliente novo" : "clientes novos"} · ${r.renewals} ${r.renewals === 1 ? "renovação" : "renovações"}` : undefined}
        />
        <KpiCard
          icon={<BadgeDollarSign />}
          tone="success"
          label="Total recebido"
          loading={loading}
          value={r ? formatBRL(r.total_received) : formatBRL(0)}
          sub={r && r.pending_count > 0 ? `+ ${formatBRL(r.pending_amount)} pendente (${r.pending_count}), fora do total` : "Somente pagamentos confirmados"}
        />
        <KpiCard
          icon={<Users />}
          tone="navy"
          label="Assinantes ativos"
          loading={loading}
          value={r ? formatInt(r.active_subscribers) : "0"}
          sub="Agora · planos pagos dentro da validade"
        />
        <KpiCard
          icon={r && r.net_profit < 0 ? <TrendingDown /> : <TrendingUp />}
          tone={r && r.net_profit < 0 ? "loss" : "profit"}
          label="Lucro líquido"
          loading={loading}
          value={r ? formatBRL(r.net_profit) : formatBRL(0)}
          sub={r ? `${formatBRL(r.total_received)} recebido − ${formatBRL(r.expenses_total)} em despesas` : undefined}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader icon={<ChartLine />} title="Evolução das receitas de assinaturas" description="Receitas confirmadas x despesas da plataforma no período." />
          <CardBody>
            <div className="mb-2 flex items-center gap-4 text-[13px] font-medium text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded-full" style={{ background: COLORS.receita }} /> Receitas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: COLORS.despesa }} /> Despesas
              </span>
            </div>
            {sales.loading && !sales.data ? <Skeleton className="h-[280px]" /> : <RevenueChart data={series} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader icon={<Crown />} title="Faturamento por plano" description="Pagamentos confirmados no período." />
          <CardBody>
            {!r?.by_plan.length ? (
              <p className="py-8 text-center text-sm text-muted">Nenhuma venda confirmada no período.</p>
            ) : (
              <ul className="space-y-4">
                {r.by_plan.map((p) => {
                  const pct = r.total_received > 0 ? Math.round((p.amount / r.total_received) * 100) : 0;
                  return (
                    <li key={p.plan_id}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-semibold">{p.plan_name}</span>
                        <span className="font-bold tabular-nums">{formatBRL(p.amount)}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700" style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {p.count} {p.count === 1 ? "venda" : "vendas"} · {pct}%
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {r && r.refunded_amount > 0 && <p className="mt-4 text-xs text-muted">Estornos no período (fora do total): {formatBRL(r.refunded_amount)}.</p>}
          </CardBody>
        </Card>
      </div>

      {/* ---------------- Histórico de vendas ---------------- */}
      <Card className="mt-6">
        <CardHeader
          icon={<Receipt />}
          title="Histórico de vendas"
          description="Cada pagamento confirmado conta como uma venda. Pendentes não entram no faturamento."
          action={
            <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!filtered.length}>
              <Download /> CSV
            </Button>
          }
        />
        <CardBody>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
            <Input icon={<Search />} placeholder="Buscar por cliente, e-mail ou ID do pagamento…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar vendas" />
            <Segmented
              value={statusFilter}
              onChange={setStatusFilter}
              size="sm"
              options={[
                { value: "", label: "Todos" },
                { value: "confirmado", label: "Confirmados" },
                { value: "pendente", label: "Pendentes" },
                { value: "cancelado", label: "Cancelados" },
                { value: "estornado", label: "Estornados" },
              ]}
            />
          </div>
          {sales.error && <ErrorNote message={sales.error} onRetry={sales.reload} />}
          {sales.loading && !sales.data ? (
            <Skeleton className="h-40" />
          ) : !filtered.length ? (
            <EmptyState
              icon={<Receipt />}
              title={sales.data?.length ? "Nenhuma venda com esses filtros" : "Nenhuma venda registrada ainda"}
              description={sales.data?.length ? undefined : "Quando um cliente pagar pelo WhatsApp, registre aqui para liberar o plano e atualizar os indicadores."}
              action={
                !sales.data?.length ? (
                  <Button onClick={() => setRegistering(true)}>
                    <Plus /> Registrar nova venda
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden grid-cols-[1.6fr_1fr_0.8fr_1fr_0.8fr_0.8fr] gap-4 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wide text-muted lg:grid">
                <span>Cliente</span>
                <span>Plano</span>
                <span>Valor pago</span>
                <span>Pagamento</span>
                <span>Vencimento</span>
                <span>Status</span>
              </div>
              <ul className="divide-y divide-line">
                {filtered.map((s) => (
                  <li key={s.id} className="py-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 lg:grid-cols-[1.6fr_1fr_0.8fr_1fr_0.8fr_0.8fr] lg:items-center">
                      <div className="col-span-2 min-w-0 lg:col-span-1">
                        <p className="truncate font-semibold">{s.customer_name || "Sem nome"}</p>
                        <p className="truncate text-[13px] text-muted">
                          {s.customer_email || "conta excluída"}
                          {!s.user_id && s.customer_email && " · conta excluída"}
                        </p>
                      </div>
                      <div className="text-sm">
                        <span className="block text-xs font-semibold uppercase text-muted lg:hidden">Plano</span>
                        <span className="font-medium">{(s.plan_name ?? s.plan_id).replace(/^Plano\s+/i, "")}</span>
                        {s.kind === "renovacao" && (
                          <Badge tone="brand" className="ml-1.5">
                            <RotateCcw /> Renovação
                          </Badge>
                        )}
                      </div>
                      <p className={cn("text-sm font-bold tabular-nums", (s.status === "cancelado" || s.status === "estornado") && "text-muted line-through")}>
                        <span className="block text-xs font-semibold uppercase text-muted no-underline lg:hidden">Valor</span>
                        {formatBRL(s.amount)}
                      </p>
                      <p className="text-sm">
                        <span className="block text-xs font-semibold uppercase text-muted lg:hidden">Pagamento</span>
                        {formatDate(s.paid_at)}
                        <span className="block text-xs text-muted">{methodLabel(s.method)}</span>
                      </p>
                      <p className="text-sm">
                        <span className="block text-xs font-semibold uppercase text-muted lg:hidden">Vencimento</span>
                        {s.period_end ? formatDate(s.period_end) : "—"}
                      </p>
                      <div>
                        <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
                      </div>
                    </div>
                    {(s.payment_ref || s.notes || s.status_reason) && (
                      <p className="mt-2 text-[12.5px] text-muted">
                        {[s.payment_ref && `ID: ${s.payment_ref}`, s.notes, s.status_reason && `Motivo: ${s.status_reason}`].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {(s.status === "pendente" || s.status === "confirmado") && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {s.status === "pendente" && (
                          <>
                            <Button size="sm" onClick={() => setConfirming(s)}>
                              <CircleCheck /> Confirmar recebimento
                            </Button>
                            <Button size="sm" variant="ghost" className="text-expense hover:text-expense" onClick={() => setCanceling(s)}>
                              <Ban /> Cancelar
                            </Button>
                          </>
                        )}
                        {s.status === "confirmado" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted"
                            onClick={() => {
                              setRefundReason("");
                              setRefunding(s);
                            }}
                          >
                            <RotateCcw /> Estornar
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-right text-[13px] text-muted">
                {filtered.length} {filtered.length === 1 ? "registro" : "registros"} · confirmados:{" "}
                <strong className="text-ink">{formatBRL(filtered.filter((s) => s.status === "confirmado").reduce((a, s) => a + s.amount, 0))}</strong>
              </p>
            </>
          )}
        </CardBody>
      </Card>

      {/* ---------------- Despesas da plataforma ---------------- */}
      <Card className="mt-6">
        <CardHeader
          icon={<Wallet />}
          title="Despesas da plataforma"
          description="Hospedagem, domínio, ferramentas e outros custos. Usadas no cálculo do lucro líquido."
          action={
            <Button size="sm" onClick={() => setAddingExpense(true)}>
              <Plus /> Registrar despesa
            </Button>
          }
        />
        <CardBody>
          {expenses.error && <ErrorNote message={expenses.error} onRetry={expenses.reload} />}
          {expenses.loading && !expenses.data ? (
            <Skeleton className="h-24" />
          ) : !expenses.data?.length ? (
            <p className="py-6 text-center text-sm text-muted">Nenhuma despesa registrada no período.</p>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {expenses.data.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-expense-soft text-expense [&_svg]:size-5">
                      <TrendingDown />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{e.description}</p>
                      <p className="truncate text-[13px] text-muted">
                        {categoryLabel(e.category)} · {formatDate(brMidnight(e.spent_on))}
                        {e.notes ? ` · ${e.notes}` : ""}
                      </p>
                    </div>
                    <span className="font-bold tabular-nums text-expense">− {formatBRL(e.amount)}</span>
                    <button
                      onClick={() => setDeletingExpense({ id: e.id, description: e.description })}
                      className="grid size-9 place-items-center rounded-lg text-muted transition hover:bg-expense-soft hover:text-expense"
                      aria-label={`Excluir despesa ${e.description}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-right text-[13px] text-muted">
                Total no período: <strong className="text-ink">{formatBRL(expenses.data.reduce((a, e) => a + e.amount, 0))}</strong>
              </p>
            </>
          )}
        </CardBody>
      </Card>

      <RegisterSaleDialog open={registering} onClose={() => setRegistering(false)} />
      <ExpenseDialog open={addingExpense} onClose={() => setAddingExpense(false)} />

      <ConfirmDialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        onConfirm={() => run(() => backend.admin.confirmPayment(confirming!.id), "Pagamento confirmado", "O plano foi liberado e os indicadores foram atualizados.")}
        danger={false}
        title="Confirmar o recebimento?"
        description={confirming ? `${formatBRL(confirming.amount)} de ${confirming.customer_email} (${confirming.plan_name}). O valor entra no faturamento e o plano é liberado.` : undefined}
        confirmLabel="Confirmar e liberar plano"
      />
      <ConfirmDialog
        open={Boolean(canceling)}
        onClose={() => setCanceling(null)}
        onConfirm={() => run(() => backend.admin.cancelPayment(canceling!.id, "Cancelado pelo proprietário"), "Pagamento pendente cancelado")}
        danger
        title="Cancelar este pagamento pendente?"
        description="Ele continua no histórico como cancelado e não entra no faturamento."
        confirmLabel="Cancelar pagamento"
      />
      <ConfirmDialog
        open={Boolean(deletingExpense)}
        onClose={() => setDeletingExpense(null)}
        onConfirm={() => run(() => backend.admin.deleteExpense(deletingExpense!.id), "Despesa excluída")}
        danger
        title="Excluir esta despesa?"
        description={deletingExpense ? `"${deletingExpense.description}" sai do cálculo do lucro. A exclusão fica no registro de operações.` : undefined}
        confirmLabel="Excluir"
      />
      <Dialog
        open={Boolean(refunding)}
        onClose={() => !refundSaving && setRefunding(null)}
        size="sm"
        title="Estornar pagamento"
        description={refunding ? `${formatBRL(refunding.amount)} · ${refunding.customer_email}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefunding(null)} disabled={refundSaving}>
              Voltar
            </Button>
            <Button variant="danger" onClick={refund} loading={refundSaving} disabled={!refundReason.trim()}>
              Estornar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            O valor sai do faturamento e do lucro. O valor original não é apagado (fica no histórico como estornado). O plano do cliente não muda: se for o caso, suspenda ou cancele em
            Administração › Clientes.
          </p>
          <Field label="Motivo do estorno">{(p) => <Textarea {...p} rows={2} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} maxLength={300} />}</Field>
        </div>
      </Dialog>
    </div>
  );
}
