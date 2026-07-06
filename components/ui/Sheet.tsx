"use client";

import { ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/**
 * Bottom sheet on mobile, centered dialog on larger screens.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "glass-strong relative z-10 max-h-[90svh] w-full max-w-app animate-slide-up overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl sm:animate-scale-in",
        )}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-xl">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-xl p-1 text-white/50 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-400/60"
              aria-label={t.ui.close}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="sticky bottom-0 border-t border-white/10 bg-white/[0.04] px-5 py-3 pb-safe backdrop-blur-xl sm:rounded-b-3xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
