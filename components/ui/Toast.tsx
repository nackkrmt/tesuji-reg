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
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  t.kind === "success" && "bg-emerald-400/20 text-emerald-300",
                  t.kind === "error" && "bg-rose-400/20 text-rose-300",
                  t.kind === "info" && "bg-brand-400/20 text-brand-300",
                )}
              >
                {t.kind === "success" ? "✓" : t.kind === "error" ? "!" : "i"}
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
