"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDataLayer } from "@/lib/data/store";
import { withRetry } from "@/lib/retry";
import type { AdminAccess } from "@/lib/admin-access";
import { CenterLoader, ErrorState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import {
  AdminAccessProvider,
  type AdminAccessValue,
} from "@/components/admin/AdminAccessContext";

export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dl = useDataLayer();
  // Held in a ref: the toast context value is a fresh object on every toast, so
  // depending on it would re-subscribe the auth listener each time one shows.
  const toastRef = useRef(useToast());
  // null = no verdict yet. A verdict with role null means "nobody here" and
  // redirects; admin / subadmin opens the shell with that access in context.
  const [access, setAccess] = useState<AdminAccess | null>(null);
  // Distinct from a role-null verdict: the check could not be completed. Only
  // a real answer from the server means "not staff".
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Read back inside the retry's catch, which outlives the render that created
  // it — the state value there would be forever null.
  const accessRef = useRef<AdminAccess | null>(null);
  // Which account the last check ran for. onAuthChange also fires on the
  // SIGNED_IN that Supabase re-emits every time the tab regains focus; without
  // this, returning to a backgrounded /admin tab re-ran the whole check (and,
  // on a flaky mobile connection, bounced the admin out mid-review).
  const checkedUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;

    const check = () => {
      // getAdminAccess() throws on a failed RPC and answers role null only for
      // a real denial, so the two are distinguishable here: never redirect on
      // a failure, only on a definitive null.
      setFailed(false);
      withRetry(() => dl.getAdminAccess(), { isCancelled: () => !active })
        .then((a) => {
          if (!active) return;
          accessRef.current = a;
          setAccess(a);
          if (a.role === null) router.replace("/admin/login");
        })
        .catch(() => {
          if (!active) return;
          // Keep whatever the gate already decided. Throwing a working admin
          // back to the login page loses the rejection note / seat edit they
          // were in the middle of, and the server-side gate on every admin RPC
          // is the real protection anyway.
          if (accessRef.current?.role) {
            toastRef.current.show(
              "เช็กสิทธิ์ไม่สำเร็จ (เครือข่ายมีปัญหา) — ยังใช้งานต่อได้",
              "error",
            );
          } else {
            // No verdict yet and the check could not run — offer a retry rather
            // than a login page the admin does not need.
            setFailed(true);
          }
        });
    };

    void dl.getCurrentUser().then((u) => {
      if (!active) return;
      checkedUid.current = u?.id ?? null;
      check();
    });

    // Re-check only when the ACCOUNT changes (sign-out in another tab, expiry,
    // a different admin signing in) — not on every auth callback.
    const unsub = dl.onAuthChange((user) => {
      const uid = user?.id ?? null;
      if (uid === checkedUid.current) return;
      checkedUid.current = uid;
      check();
    });
    return () => {
      active = false;
      unsub();
    };
    // `attempt` re-runs the whole effect when the admin presses retry.
  }, [dl, router, attempt]);

  const value = useMemo<AdminAccessValue | null>(() => {
    if (!access?.role) return null;
    return {
      role: access.role,
      isAdmin: access.role === "admin",
      tournamentIds: access.tournamentIds,
      access,
    };
  }, [access]);

  if (!value)
    return (
      <div className="flex min-h-screen-safe items-center justify-center p-6">
        {failed ? (
          <ErrorState onRetry={() => setAttempt((n) => n + 1)} />
        ) : (
          <CenterLoader label="กำลังตรวจสอบสิทธิ์…" />
        )}
      </div>
    );
  return <AdminAccessProvider value={value}>{children}</AdminAccessProvider>;
}
