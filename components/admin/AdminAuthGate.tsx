"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDataLayer } from "@/lib/data/store";
import { CenterLoader } from "@/components/ui/feedback";

export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const dl = useDataLayer();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    // The real gate is server-side (every admin RPC checks the admin role); this
    // only decides whether to render the panel or bounce to the login page.
    dl.isAdmin()
      .then((authed) => {
        if (!active) return;
        setOk(authed);
        if (!authed) router.replace("/admin/login");
      })
      .catch(() => {
        if (!active) return;
        setOk(false);
        router.replace("/admin/login");
      });
    return () => {
      active = false;
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
