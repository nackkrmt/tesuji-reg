"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RegistrationStatus, REGISTRATION_STATUS_LABEL } from "@/lib/data/types";

const statusStyle: Record<RegistrationStatus, string> = {
  draft: "bg-white/10 text-white/60 ring-white/15",
  pending_payment: "bg-amber-400/15 text-amber-300 ring-amber-400/25",
  pending_review: "bg-sky-400/15 text-sky-300 ring-sky-400/25",
  confirmed: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25",
  rejected: "bg-rose-400/15 text-rose-300 ring-rose-400/25",
  expired: "bg-white/10 text-white/40 ring-white/10",
  cancelled: "bg-white/10 text-white/40 ring-white/10",
};

export function StatusBadge({ status }: { status: RegistrationStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        statusStyle[status],
      )}
    >
      {REGISTRATION_STATUS_LABEL[status]}
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        tone === "neutral" && "bg-white/10 text-white/60 ring-white/15",
        tone === "good" && "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25",
        tone === "warn" && "bg-amber-400/15 text-amber-300 ring-amber-400/25",
        tone === "bad" && "bg-rose-400/15 text-rose-300 ring-rose-400/25",
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
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white/60">
        ⊘
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

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-brand-400",
        className,
      )}
    />
  );
}

export function CenterLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-white/45">
      <Spinner />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
