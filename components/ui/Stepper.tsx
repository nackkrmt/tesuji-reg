"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** The registration wizard's progress row. An ordered list with
 *  aria-current="step": as a bare div with a "✓" glyph it announced
 *  "1 ผู้สมัคร 2 เลือกรุ่น 3 ชำระเงิน" with no hint of where the user was. */
export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number; // 0-based
}) {
  const { t } = useI18n();
  return (
    <ol className="flex items-center gap-2" aria-label={t.ui.progress}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className="flex flex-1 items-center gap-2"
          >
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all",
                  done && "bg-brand-600 text-white",
                  active &&
                    "bg-brand-500 text-white ring-4 ring-brand-500/25 shadow-[0_0_18px_-2px_rgba(10,132,255,0.7)]",
                  !done && !active && "bg-white/10 text-ink-tertiary",
                )}
              >
                {done ? <span aria-hidden="true">✓</span> : i + 1}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-[11px]",
                  active ? "font-semibold text-white" : "text-ink-tertiary",
                )}
              >
                {label}
                {done && <span className="sr-only"> {t.ui.stepDone}</span>}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                aria-hidden="true"
                className={cn(
                  "mb-4 h-0.5 flex-1 rounded",
                  i < current ? "bg-brand-500" : "bg-white/10",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
