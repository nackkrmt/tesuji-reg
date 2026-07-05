"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RegistrationStatus } from "@/lib/data/types";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/Button";

// One pill shell + one tone map. StatusBadge, Pill and count badges all compose
// these so every rounded-full status chip in the app shares a single source of
// truth (bg-*-400/15 · text-*-300 · ring-*-400/25).
const pillShell =
  "inline-flex items-center rounded-full font-semibold ring-1 ring-inset";
const pillSize = {
  md: "px-2.5 py-1 text-xs",
  sm: "px-2 py-0.5 text-[11px]",
};

const toneStyle = {
  neutral: "bg-white/10 text-white/60 ring-white/15",
  good: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25",
  warn: "bg-amber-400/15 text-amber-300 ring-amber-400/25",
  bad: "bg-rose-400/15 text-rose-300 ring-rose-400/25",
} as const;

const statusStyle: Record<RegistrationStatus, string> = {
  draft: toneStyle.neutral,
  pending_payment: toneStyle.warn,
  pending_review: "bg-sky-400/15 text-sky-300 ring-sky-400/25",
  confirmed: toneStyle.good,
  rejected: toneStyle.bad,
  expired: "bg-white/10 text-white/40 ring-white/10",
  cancelled: "bg-white/10 text-white/40 ring-white/10",
};

export function StatusBadge({ status }: { status: RegistrationStatus }) {
  const { t } = useI18n();
  return (
    <span className={cn(pillShell, pillSize.md, statusStyle[status])}>
      {t.status[status]}
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
  size = "md",
}: {
  children: ReactNode;
  tone?: keyof typeof toneStyle;
  size?: keyof typeof pillSize;
}) {
  return (
    <span className={cn(pillShell, pillSize[size], toneStyle[tone])}>
      {children}
    </span>
  );
}

/** Brand code / seat-code chip (รหัสรุ่น, รหัสที่นั่ง). Distinct from a status
 *  pill — a code, not a state — so it gets the brighter brand-200 ink. */
export function CodeChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg bg-brand-500/15 px-2 py-0.5 text-xs font-bold text-brand-200 ring-1 ring-inset ring-brand-400/25",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white/50">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 13h4l2 3h4l2-3h4" />
          <path d="M5 13l1.6-6.4A2 2 0 018.5 5h7a2 2 0 011.9 1.6L19 13v4a2 2 0 01-2 2H7a2 2 0 01-2-2v-4z" />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-white/90">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-white/45">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** Shown when a live query's retries are exhausted and it surfaced an error —
 *  distinct from EmptyState so "failed to load" never looks like "nothing
 *  here yet" (the latter is especially misleading during a registration rush
 *  where a network blip could otherwise read as "no one has signed up"). */
export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-rose-400/25 bg-rose-500/[0.04] px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-400/15 text-rose-300">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M10.3 4.3l-8 14A2 2 0 004 21.3h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z" />
          <path d="M12 9.5v4M12 17.5h.01" />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-white/90">{t.common.loadErrorTitle}</p>
        <p className="mt-1 text-sm text-white/45">{t.common.loadErrorDesc}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t.common.retry}
        </Button>
      )}
    </div>
  );
}

const spinnerSize = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-8 w-8" };

export function Spinner({
  className,
  size = "md",
}: {
  className?: string;
  size?: keyof typeof spinnerSize;
}) {
  return (
    <span
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-white/20 border-t-brand-400",
        spinnerSize[size],
        className,
      )}
    />
  );
}

export function CenterLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/45">
      <Spinner size="lg" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
