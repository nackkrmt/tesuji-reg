"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDataLayer } from "@/lib/data/store";
import { withRetry } from "@/lib/retry";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";

export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dl = useDataLayer();
  // Held in a ref: the toast context value is a fresh object on every toast, so
  // depending on it would re-subscribe the auth listener each time one shows.
  const toastRef = useRef(useToast());
  const [ok, setOk] = useState<boolean | null>(null);
  // Read back inside the retry's catch, which outlives the render that created
  // it — the state value there would be forever null.
  const okRef = useRef<boolean | null>(null);
  // Which account the last check ran for. onAuthChange also fires on the
  // SIGNED_IN that Supabase re-emits every time the tab regains focus; without
  // this, returning to a backgrounded /admin tab re-ran the whole check (and,
  // on a flaky mobile connection, bounced the admin out mid-review).
  const checkedUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let active = true;

    const check = () => {
      // isAdmin() answers false for a failed RPC as well as for a real denial,
      // so a network blip reads as "not an admin". Retrying transient failures
      // is the only defence available from this side — see the handoff note
      // about making isAdmin() throw instead.
      withRetry(() => dl.isAdmin(), { isCancelled: () => !active })
        .then((authed) => {
          if (!active) return;
          okRef.current = authed;
          setOk(authed);
          if (!authed) router.replace("/admin/login");
        })
        .catch(() => {
          if (!active) return;
          // Keep whatever the gate already decided. Throwing a working admin
          // back to the login page loses the rejection note / seat edit they
          // were in the middle of, and the server-side gate on every admin RPC
          // is the real protection anyway.
          if (okRef.current === true) {
            toastRef.current.show(
              "เช็กสิทธิ์ไม่สำเร็จ (เครือข่ายมีปัญหา) — ยังใช้งานต่อได้",
              "error",
            );
          } else {
            okRef.current = false;
            setOk(false);
            router.replace("/admin/login");
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
  }, [dl, router]);

  if (ok !== true)
    return (
      <div className="flex min-h-screen-safe items-center justify-center">
        <CenterLoader label="กำลังตรวจสอบสิทธิ์…" />
      </div>
    );
  return <>{children}</>;
}
