"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isAdminAuthed } from "@/lib/admin-auth";
import { CenterLoader } from "@/components/ui/feedback";

export default function AdminAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const authed = isAdminAuthed();
    setOk(authed);
    if (!authed) router.replace("/admin/login");
  }, [router]);

  if (ok !== true) return <CenterLoader label="กำลังตรวจสอบสิทธิ์…" />;
  return <>{children}</>;
}
