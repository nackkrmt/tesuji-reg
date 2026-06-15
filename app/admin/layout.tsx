"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AdminAuthGate from "@/components/admin/AdminAuthGate";
import AdminShell from "@/components/admin/AdminShell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The login page must render outside the auth gate / shell.
  if (pathname === "/admin/login") return <>{children}</>;

  return (
    <AdminAuthGate>
      <AdminShell>{children}</AdminShell>
    </AdminAuthGate>
  );
}
