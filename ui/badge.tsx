import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface text-muted ring-1 ring-line",
        brand: "bg-brand-50 text-brand-700 ring-1 ring-brand-100",
        success: "bg-income-soft text-income ring-1 ring-income/15",
        danger: "bg-expense-soft text-expense ring-1 ring-expense/15",
        warn: "bg-warn-soft text-warn ring-1 ring-warn/20",
        dark: "bg-white/10 text-white ring-1 ring-white/15",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
