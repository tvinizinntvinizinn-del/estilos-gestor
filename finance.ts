import type { DateRange, Transaction } from "./data/types";
import { addDays, brDateKey, brMidnight, brParts } from "./utils";

export type PeriodKey = "hoje" | "7d" | "30d" | "mes" | "ano" | "custom";

export const PERIOD_OPTIONS: Array<{ value: PeriodKey; label: string }> = [
  { value: "hoje", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "mes", label: "Este mês" },
  { value: "ano", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];

export type Granularity = "hour" | "day" | "month";

/** Intervalo do período no horário de Brasília. */
export function periodRange(period: PeriodKey, custom?: { from: string; to: string }): DateRange & { granularity: Granularity } {
  const now = new Date();
  const today = brDateKey(now);
  const endOfToday = new Date(brMidnight(brDateKey(addDays(brMidnight(today), 1))).getTime() - 1);
  switch (period) {
    case "hoje":
      return { from: brMidnight(today), to: endOfToday, granularity: "hour" };
    case "7d":
      return { from: brMidnight(brDateKey(addDays(brMidnight(today), -6))), to: endOfToday, granularity: "day" };
    case "30d":
      return { from: brMidnight(brDateKey(addDays(brMidnight(today), -29))), to: endOfToday, granularity: "day" };
    case "mes":
      return { from: brMidnight(today.slice(0, 8) + "01"), to: endOfToday, granularity: "day" };
    case "ano":
      return { from: brMidnight(today.slice(0, 5) + "01-01"), to: endOfToday, granularity: "month" };
    case "custom": {
      const fromKey = custom?.from || today;
      const toKey = custom?.to && custom.to >= fromKey ? custom.to : fromKey;
      const from = brMidnight(fromKey);
      const to = new Date(brMidnight(brDateKey(addDays(brMidnight(toKey), 1))).getTime() - 1);
      const days = (to.getTime() - from.getTime()) / 86_400_000;
      return { from, to, granularity: days <= 1 ? "hour" : days <= 92 ? "day" : "month" };
    }
  }
}

export interface SeriesPoint {
  key: string;
  label: string;
  fullLabel: string;
  entradas: number;
  saidas: number;
  saldo: number;
  acumulado: number;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function bucketKey(d: Date, g: Granularity) {
  const p = brParts(d);
  const mm = String(p.m).padStart(2, "0");
  const dd = String(p.d).padStart(2, "0");
  if (g === "month") return `${p.y}-${mm}`;
  if (g === "day") return `${p.y}-${mm}-${dd}`;
  return `${p.y}-${mm}-${dd}T${String(p.h).padStart(2, "0")}`;
}

/** Agrupa entradas e saídas reais por hora, dia ou mês (sem números fictícios). */
export function buildSeries(transactions: Transaction[], range: DateRange & { granularity: Granularity }): SeriesPoint[] {
  const g = range.granularity;
  const buckets = new Map<string, SeriesPoint>();

  // Cria todos os pontos do período (dias sem movimento aparecem como zero)
  const cursor = new Date(range.from);
  const stop = Math.min(range.to.getTime(), g === "hour" ? Date.now() : range.to.getTime());
  let guard = 0;
  while (cursor.getTime() <= stop && guard++ < 800) {
    const key = bucketKey(cursor, g);
    if (!buckets.has(key)) {
      const p = brParts(cursor);
      const label =
        g === "month" ? MONTHS[p.m - 1] : g === "day" ? `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}` : `${String(p.h).padStart(2, "0")}h`;
      const fullLabel =
        g === "month"
          ? `${MONTHS[p.m - 1]} de ${p.y}`
          : g === "day"
            ? `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`
            : `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")} às ${String(p.h).padStart(2, "0")}h`;
      buckets.set(key, { key, label, fullLabel, entradas: 0, saidas: 0, saldo: 0, acumulado: 0 });
    }
    if (g === "hour") cursor.setTime(cursor.getTime() + 3_600_000);
    else if (g === "day") cursor.setTime(cursor.getTime() + 86_400_000);
    else {
      const p = brParts(cursor);
      const next = p.m === 12 ? `${p.y + 1}-01-01` : `${p.y}-${String(p.m + 1).padStart(2, "0")}-01`;
      cursor.setTime(brMidnight(next).getTime());
    }
  }

  for (const t of transactions) {
    const d = new Date(t.occurred_at);
    if (d < range.from || d > range.to) continue;
    const b = buckets.get(bucketKey(d, g));
    if (!b) continue;
    if (t.type === "entrada") b.entradas += t.amount;
    else b.saidas += t.amount;
  }

  let acc = 0;
  return [...buckets.values()].map((b) => {
    b.entradas = Math.round(b.entradas * 100) / 100;
    b.saidas = Math.round(b.saidas * 100) / 100;
    b.saldo = Math.round((b.entradas - b.saidas) * 100) / 100;
    acc += b.saldo;
    b.acumulado = Math.round(acc * 100) / 100;
    return b;
  });
}

export function totals(transactions: Transaction[]) {
  let entradas = 0;
  let saidas = 0;
  for (const t of transactions) {
    if (t.type === "entrada") entradas += t.amount;
    else saidas += t.amount;
  }
  return { entradas, saidas, saldo: entradas - saidas };
}
