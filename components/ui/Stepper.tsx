"use client";

import { cn } from "@/lib/utils";

export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number; // 0-based
}) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all",
                  done && "bg-brand-600 text-white",
                  active &&
                    "bg-brand-500 text-white ring-4 ring-brand-500/25 shadow-[0_0_18px_-2px_rgba(10,132,255,0.7)]",
                  !done && !active && "bg-white/10 text-white/40",
                )}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-[11px]",
                  active ? "font-semibold text-white" : "text-white/40",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "mb-4 h-0.5 flex-1 rounded",
                  i < current ? "bg-brand-500" : "bg-white/10",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
