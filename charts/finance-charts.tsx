"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/finance";
import { formatBRL, formatBRLCompact } from "@/lib/utils";

// Cores pedidas pela identidade (verde = entradas, vermelho = saídas).
// Verde x vermelho se confunde para daltônicos, por isso as saídas usam linha
// tracejada e a legenda/tooltip sempre trazem o nome por escrito.
export const CHART_COLORS = {
  entradas: "#16A34A",
  saidas: "#EF4444",
  saldo: "#2563EB",
  grid: "#E3E9F2",
  axis: "#5B6B82",
};

const SAIDAS_DASH = "7 4";

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; payload?: SeriesPoint }>;
}

function Swatch({ kind }: { kind: "entradas" | "saidas" | "saldo" }) {
  return (
    <svg width="18" height="8" aria-hidden className="shrink-0">
      <line
        x1="1"
        y1="4"
        x2="17"
        y2="4"
        stroke={CHART_COLORS[kind]}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={kind === "saidas" ? "4 3" : undefined}
      />
    </svg>
  );
}

function FlowTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (!p) return null;
  return (
    <div className="min-w-[190px] rounded-xl bg-white px-3.5 py-3 text-sm shadow-lift ring-1 ring-line">
      <p className="mb-2 text-xs font-semibold text-muted">{p.fullLabel}</p>
      <div className="space-y-1.5">
        <p className="flex items-center gap-2">
          <Swatch kind="entradas" />
          <span className="text-muted">Entradas</span>
          <span className="ml-auto font-semibold tabular-nums text-ink">{formatBRL(p.entradas)}</span>
        </p>
        <p className="flex items-center gap-2">
          <Swatch kind="saidas" />
          <span className="text-muted">Saídas</span>
          <span className="ml-auto font-semibold tabular-nums text-ink">{formatBRL(p.saidas)}</span>
        </p>
        <p className="flex items-center gap-2 border-t border-line pt-1.5">
          <span className="w-[18px]" />
          <span className="text-muted">Saldo</span>
          <span className="ml-auto font-bold tabular-nums text-ink">{formatBRL(p.saldo)}</span>
        </p>
      </div>
    </div>
  );
}

function BalanceTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (!p) return null;
  return (
    <div className="min-w-[180px] rounded-xl bg-white px-3.5 py-3 text-sm shadow-lift ring-1 ring-line">
      <p className="mb-1.5 text-xs font-semibold text-muted">{p.fullLabel}</p>
      <p className="flex items-center gap-2">
        <span className="text-muted">Saldo acumulado</span>
        <span className="ml-auto font-bold tabular-nums text-ink">{formatBRL(p.acumulado)}</span>
      </p>
      <p className="mt-1 flex items-center gap-2 text-xs">
        <span className="text-muted">No período</span>
        <span className="ml-auto font-semibold tabular-nums text-ink">{formatBRL(p.saldo)}</span>
      </p>
    </div>
  );
}

export function FlowLegend() {
  return (
    <div className="flex items-center gap-4 text-[13px] font-medium text-muted">
      <span className="inline-flex items-center gap-1.5">
        <Swatch kind="entradas" /> Entradas
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch kind="saidas" /> Saídas
      </span>
    </div>
  );
}

const axisTick = { fill: CHART_COLORS.axis, fontSize: 12 };

/** Linha verde (entradas) x linha vermelha tracejada (saídas). */
export function FlowLineChart({ data, height = 300 }: { data: SeriesPoint[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full" role="img" aria-label="Gráfico de linhas de entradas e saídas no período">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} tickMargin={10} minTickGap={18} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(v: number) => formatBRLCompact(v)} width={72} />
          <Tooltip content={<FlowTooltip />} cursor={{ stroke: "#93b8fd", strokeWidth: 1 }} />
          <Line
            type="monotone"
            dataKey="entradas"
            name="Entradas"
            stroke={CHART_COLORS.entradas}
            strokeWidth={2}
            dot={data.length <= 2 ? { r: 4, strokeWidth: 2, stroke: "#fff" } : false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
            animationDuration={700}
          />
          <Line
            type="monotone"
            dataKey="saidas"
            name="Saídas"
            stroke={CHART_COLORS.saidas}
            strokeWidth={2}
            strokeDasharray={SAIDAS_DASH}
            dot={data.length <= 2 ? { r: 4, strokeWidth: 2, stroke: "#fff" } : false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
            animationDuration={700}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Evolução financeira: saldo acumulado ao longo do período. */
export function BalanceAreaChart({ data, height = 260 }: { data: SeriesPoint[]; height?: number }) {
  return (
    <div style={{ height }} className="w-full" role="img" aria-label="Gráfico da evolução do saldo acumulado no período">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.saldo} stopOpacity={0.22} />
              <stop offset="100%" stopColor={CHART_COLORS.saldo} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} tickMargin={10} minTickGap={18} />
          <YAxis tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(v: number) => formatBRLCompact(v)} width={72} />
          <ReferenceLine y={0} stroke="#b9c4d4" />
          <Tooltip content={<BalanceTooltip />} cursor={{ stroke: "#93b8fd", strokeWidth: 1 }} />
          <Area
            type="monotone"
            dataKey="acumulado"
            name="Saldo acumulado"
            stroke={CHART_COLORS.saldo}
            strokeWidth={2}
            fill="url(#saldoFill)"
            activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
