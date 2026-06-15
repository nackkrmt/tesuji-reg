"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RegistrationStatus, REGISTRATION_STATUS_LABEL } from "@/lib/data/types";

const statusStyle: Record<RegistrationStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending_payment: "bg-amber-100 text-amber-700",
  pending_review: "bg-sky-100 text-sky-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  expired: "bg-slate-100 text-slate-500",
  cancelled: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ status }: { status: RegistrationStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
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
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "neutral" && "bg-slate-100 text-slate-600",
        tone === "good" && "bg-emerald-100 text-emerald-700",
        tone === "warn" && "bg-amber-100 text-amber-700",
        tone === "bad" && "bg-rose-100 text-rose-700",
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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">
        ⊘
      </div>
      <div>
        <p className="font-semibold text-slate-700">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-slate-400">{description}</p>
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
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-300 border-t-brand-700",
        className,
      )}
    />
  );
}

export function CenterLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
      <Spinner />
      {label && <p className="text-sm">{label}</p>}
    </div>
  );
}
