"use client";

import { cn } from "@/lib/utils";

/** Filter chip: a 40px-tall toggle pill (the old inline chips were ~30px —
 *  under the touch-target floor). `count` renders as a quiet tabular suffix. */
export function FilterChip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focus-ring press flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
        active
          ? "bg-brand-600 text-white"
          : "bg-white/[0.06] text-ink-secondary hover:bg-white/10 hover:text-ink",
      )}
    >
      {children}
      {count != null && (
        <span
          className={cn(
            "tabular-nums text-xs",
            active ? "text-white/80" : "text-ink-tertiary",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
