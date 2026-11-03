import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_8px_20px_-8px_rgb(37_99_235/0.7)] hover:from-brand-500 hover:to-brand-700 hover:shadow-[0_10px_26px_-8px_rgb(37_99_235/0.8)]",
        navy: "bg-navy-900 text-white hover:bg-navy-800",
        secondary: "bg-white text-ink ring-1 ring-line hover:bg-surface hover:ring-brand-200",
        outline: "bg-transparent text-ink ring-1 ring-line hover:bg-white hover:ring-brand-300",
        ghost: "bg-transparent text-muted hover:bg-navy-900/5 hover:text-ink",
        glass: "bg-white/10 text-white ring-1 ring-white/15 backdrop-blur hover:bg-white/15",
        success: "bg-income text-white shadow-[0_8px_20px_-10px_rgb(22_163_74/0.8)] hover:brightness-105",
        danger: "bg-expense text-white shadow-[0_8px_20px_-10px_rgb(239_68_68/0.8)] hover:brightness-105",
        "danger-soft": "bg-expense-soft text-expense hover:bg-expense/15",
        whatsapp: "bg-[#25D366] text-[#073b1f] shadow-[0_8px_20px_-10px_rgb(37_211_102/0.8)] hover:brightness-105",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
        "icon-sm": "size-8 rounded-lg",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
