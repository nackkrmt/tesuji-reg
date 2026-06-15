"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function CountdownTimer({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(
    () => Date.parse(expiresAt) - Date.now(),
  );
  const fired = useRef(false);

  useEffect(() => {
    const tick = () => {
      const r = Date.parse(expiresAt) - Date.now();
      setRemaining(r);
      if (r <= 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    const onVis = () => tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [expiresAt, onExpire]);

  const total = Math.max(0, remaining);
  const mm = Math.floor(total / 60000);
  const ss = Math.floor((total % 60000) / 1000);
  const danger = total <= 60_000;
  const warn = total <= 300_000;

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold",
        danger
          ? "bg-rose-100 text-rose-700"
          : warn
            ? "bg-amber-100 text-amber-700"
            : "bg-brand-50 text-brand-700",
        danger && "animate-pulse",
      )}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 7v5l3 2" />
      </svg>
      จองที่นั่งไว้ให้ — เหลือเวลาชำระเงิน {mm}:{String(ss).padStart(2, "0")} นาที
    </div>
  );
}
