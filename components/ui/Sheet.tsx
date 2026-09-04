"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet on mobile, centered dialog on larger screens.
 *
 * Portaled to <body> (same idiom as DropdownPanel) so `fixed inset-0` is always
 * relative to the VIEWPORT. Rendering a sheet inside any `backdrop-filter`
 * surface (e.g. a glass Card) would otherwise turn that ancestor into the
 * containing block — pinning the overlay to the card and breaking the panel's
 * own backdrop blur (which made it look transparent and unreadable).
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
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

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

  // Focus management. Keyed on `open` ALONE on purpose: most callers pass an
  // inline `onClose`, so adding it to the deps would tear this down and re-run
  // it on every parent render — yanking focus back into the panel while the
  // user is typing in it.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const restoreTo = document.activeElement as HTMLElement | null;

    const stops = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );

    // The panel itself rather than its first control: sheets that open onto a
    // text field would otherwise pop the iOS keyboard, which shrinks the visual
    // viewport out from under the sheet (same trap Combobox avoids).
    panel.focus();

    // The backdrop is opaque, so without a trap Tab walks the user onto
    // invisible page controls behind it — mid-withdrawal, mid-refund.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const active = document.activeElement;
      // A portaled child (Combobox's dropdown, a nested Sheet) lives outside
      // this panel in the DOM but is logically inside it — leave it alone.
      if (active && active !== document.body && !panel.contains(active)) return;
      const items = stops();
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      // Wrap at the panel's last (or first) stop, and whenever focus has come
      // to rest on the panel itself or fallen to <body> because the element
      // holding it was unmounted.
      if (!active || active === edge || active === panel || active === document.body) {
        e.preventDefault();
        const next = e.shiftKey ? items[items.length - 1] : items[0];
        (next ?? panel).focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (restoreTo?.isConnected) restoreTo.focus();
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          // outline-none: the panel takes focus on open (see the effect above);
          // the title announces the dialog, so no ring is wanted around it.
          "glass-strong relative z-10 max-h-[88svh] w-full max-w-app animate-slide-up overflow-y-auto overscroll-contain rounded-t-3xl outline-none sm:mx-4 sm:rounded-3xl sm:animate-scale-in",
        )}
      >
        {/* Mobile grab handle — signals the bottom sheet is dismissible. */}
        <div className="sticky top-0 z-20 flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-xl">
            <h3 id={titleId} className="text-lg font-semibold text-white">
              {title}
            </h3>
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
    </div>,
    document.body,
  );
}
