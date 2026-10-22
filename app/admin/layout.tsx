"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AdminAuthGate from "@/components/admin/AdminAuthGate";
import AdminShell from "@/components/admin/AdminShell";
import { AdminRouteGuard } from "@/components/admin/AdminRouteGuard";
import { AdminTournamentProvider } from "@/components/admin/AdminTournamentContext";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // The login page must render outside the auth gate / shell.
  if (pathname === "/admin/login") return <>{children}</>;

  // Gate first (it provides the access context), then the picker, then the
  // shell; the route guard sits inside the shell so a refused page still shows
  // the menu the account may use.
  return (
    <AdminAuthGate>
      <AdminTournamentProvider>
        <AdminShell>
          <AdminRouteGuard>{children}</AdminRouteGuard>
        </AdminShell>
      </AdminTournamentProvider>
    </AdminAuthGate>
  );
}
