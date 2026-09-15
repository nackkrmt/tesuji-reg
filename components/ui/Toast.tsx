"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** How long this one stays up — errors get more time (see visibleMs). */
  ms: number;
}

interface ToastCtx {
  show: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx>({ show: () => {} });

/**
 * How long a toast stays on screen.
 *
 * Every funnel rejection is delivered as an error toast, and those are long
 * multi-clause Thai sentences that name a person and two divisions — or, for a
 * duplicate entry, the reference code the parent needs in order to find the
 * registration they already have. A flat 3.8 s let that scroll past unread, so
 * errors get reading time proportional to their length.
 */
function visibleMs(kind: ToastKind, message: string): number {
  if (kind !== "error") return 3800;
  return Math.min(14000, 6000 + 50 * message.length);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  // The text handed to the live regions below, keyed so an identical repeat
  // still counts as a change.
  const [announced, setAnnounced] = useState<{
    id: number;
    kind: ToastKind;
    message: string;
  } | null>(null);
  const idRef = useRef(0);
  const timers = useRef(new Map<number, number>());

  const MAX_VISIBLE = 3;

  const clearTimer = useCallback((id: number) => {
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      setToasts((t) => t.filter((x) => x.id !== id));
    },
    [clearTimer],
  );

  const arm = useCallback(
    (id: number, ms: number) => {
      clearTimer(id);
      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id);
          setToasts((t) => t.filter((x) => x.id !== id));
        }, ms),
      );
    },
    [clearTimer],
  );

  // Drop pending timers if the provider goes away mid-flight.
  useEffect(() => {
    const handles = timers.current;
    return () => {
      handles.forEach((handle) => window.clearTimeout(handle));
      handles.clear();
    };
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = ++idRef.current;
      const ms = visibleMs(kind, message);
      arm(id, ms);
      setAnnounced({ id, kind, message });
      setToasts((t) => {
        // Same message already on screen (e.g. repeated failed submits) —
        // replace it in place instead of stacking a duplicate. The replaced
        // entry's timer is left to fire: by then no toast carries that id, so
        // it filters nothing out, and the new id above holds the fresh timer.
        const dup = t.findIndex((x) => x.kind === kind && x.message === message);
        const next =
          dup === -1
            ? [...t, { id, kind, message, ms }]
            : t.map((x, i) => (i === dup ? { id, kind, message, ms } : x));
        return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
      });
    },
    [arm],
  );

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {/* The two live regions are mounted for the life of the app and only
          their text changes. A region that appears together with its content —
          which is what the toast nodes themselves did — is generally not
          announced at all, so "slip uploaded" never reached VoiceOver. The
          keyed child makes an identical repeat a real DOM change. */}
      <div className="sr-only" role="status" aria-live="polite">
        {announced && announced.kind !== "error" && (
          <p key={announced.id}>{announced.message}</p>
        )}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive">
        {announced && announced.kind === "error" && (
          <p key={announced.id}>{announced.message}</p>
        )}
      </div>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            // Plain div: the announcing is done by the live regions above.
            // Hovering or focusing holds the toast open — a long error message
            // should not vanish out from under someone still reading it.
            onMouseEnter={() => clearTimer(toast.id)}
            onMouseLeave={() => arm(toast.id, toast.ms)}
            onFocus={() => clearTimer(toast.id)}
            onBlur={() => arm(toast.id, toast.ms)}
            className={cn(
              "glass-strong pointer-events-auto w-full max-w-app animate-scale-in rounded-2xl px-4 py-3 text-sm font-medium text-white",
              toast.kind === "success" && "border-emerald-400/30",
              toast.kind === "error" && "border-rose-400/30",
              toast.kind === "info" && "border-white/15",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  toast.kind === "success" && "bg-emerald-400/20 text-emerald-300",
                  toast.kind === "error" && "bg-rose-400/20 text-rose-300",
                  toast.kind === "info" && "bg-brand-400/20 text-brand-300",
                )}
              >
                <ToastIcon kind={toast.kind} />
              </span>
              <span className="min-w-0 flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label={t.ui.close}
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white/60 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-brand-400/60"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastCtx {
  return useContext(Ctx);
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (kind === "success")
    return (
      <svg {...common}>
        <path d="M5 13l4 4L19 7" />
      </svg>
    );
  if (kind === "error")
    return (
      <svg {...common}>
        <path d="M10.3 4.3l-8 14A2 2 0 004 21.3h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z" />
        <path d="M12 10v3.5M12 17.5h.01" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}
