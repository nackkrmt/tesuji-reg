"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "success";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-[0_8px_24px_-8px_rgba(10,132,255,0.7)] hover:bg-brand-500 active:bg-brand-700 disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none",
  secondary:
    "glass text-white hover:bg-white/10 disabled:text-white/30 disabled:opacity-60",
  danger:
    "bg-rose-500 text-white shadow-[0_8px_24px_-8px_rgba(244,63,94,0.7)] hover:bg-rose-400 active:bg-rose-600 disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none",
  success:
    "bg-emerald-500 text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.7)] hover:bg-emerald-400 active:bg-emerald-600 disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none",
  ghost:
    "bg-transparent text-white/80 hover:bg-white/10 disabled:text-white/30",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", fullWidth, loading, className, children, disabled, ...rest },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
          fullWidth && "w-full",
          variants[variant],
          className,
        )}
        {...rest}
      >
        {loading && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
