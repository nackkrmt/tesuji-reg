"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RegisterFlowProvider } from "@/components/register/RegisterFlowProvider";
import { PublicHeader } from "@/components/PublicHeader";
import { Stepper } from "@/components/ui/Stepper";
import { useAuth } from "@/components/auth/AuthProvider";
import { useDataLayer } from "@/lib/data/store";
import { CenterLoader } from "@/components/ui/feedback";

const STEPS = ["ผู้สมัคร", "เลือกรุ่น", "ชำระเงิน"];

function RegisterGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const dl = useDataLayer();
  const router = useRouter();
  const [state, setState] = useState<"checking" | "ok">("checking");

  // One definitive profile check once auth has settled, avoiding the
  // stale-null race that a live query can hit during session restore.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login?next=/register");
      return;
    }
    let active = true;
    setState("checking");
    dl.getMyProfile().then((profile) => {
      if (!active) return;
      if (profile === null) router.replace("/profile?next=/register");
      else setState("ok");
    });
    return () => {
      active = false;
    };
  }, [loading, user, dl, router]);

  if (state !== "ok") return <CenterLoader label="กำลังโหลด…" />;
  return <>{children}</>;
}

export default function RegisterLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stepIndex = pathname.endsWith("/payment")
    ? 2
    : pathname.endsWith("/categories")
      ? 1
      : pathname.endsWith("/applicant")
        ? 0
        : -1;

  return (
    <RegisterFlowProvider>
      <PublicHeader back="/" title="สมัครการแข่งขัน" />
      {stepIndex >= 0 ? (
        <RegisterGate>
          <div className="mx-auto max-w-app px-5 pt-4">
            <Stepper steps={STEPS} current={stepIndex} />
          </div>
          {children}
        </RegisterGate>
      ) : (
        children
      )}
    </RegisterFlowProvider>
  );
}
