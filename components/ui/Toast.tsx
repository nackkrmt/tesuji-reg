"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastCtx {
  show: (message: string, kind?: ToastKind) => void;
}

const Ctx = createContext<ToastCtx>({ show: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const show = useCallback((message: string, kind: ToastKind = "info") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3800);
  }, []);

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "glass-strong pointer-events-auto w-full max-w-app animate-scale-in rounded-2xl px-4 py-3 text-sm font-medium text-white",
              t.kind === "success" && "border-emerald-400/30",
              t.kind === "error" && "border-rose-400/30",
              t.kind === "info" && "border-white/15",
            )}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  t.kind === "success" && "bg-emerald-400/20 text-emerald-300",
                  t.kind === "error" && "bg-rose-400/20 text-rose-300",
                  t.kind === "info" && "bg-brand-400/20 text-brand-300",
                )}
              >
                <ToastIcon kind={t.kind} />
              </span>
              <span className="min-w-0 flex-1">{t.message}</span>
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
