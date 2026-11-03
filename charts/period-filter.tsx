"use client";

import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/finance";

/** Filtros de período em uma única linha acima dos gráficos. */
export function PeriodFilter({
  period,
  onPeriod,
  custom,
  onCustom,
}: {
  period: PeriodKey;
  onPeriod: (p: PeriodKey) => void;
  custom: { from: string; to: string };
  onCustom: (c: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <Segmented value={period} onChange={onPeriod} options={PERIOD_OPTIONS} size="sm" />
      {period === "custom" && (
        <div className="flex items-center gap-2">
          <CalendarRange className="hidden size-4 text-muted sm:block" />
          <Input
            type="date"
            aria-label="Data inicial"
            value={custom.from}
            max={custom.to || undefined}
            onChange={(e) => onCustom({ ...custom, from: e.target.value })}
            className="h-10 w-auto"
          />
          <span className="text-sm text-muted">até</span>
          <Input
            type="date"
            aria-label="Data final"
            value={custom.to}
            min={custom.from || undefined}
            onChange={(e) => onCustom({ ...custom, to: e.target.value })}
            className="h-10 w-auto"
          />
        </div>
      )}
    </div>
  );
}
