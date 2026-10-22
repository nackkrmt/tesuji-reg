"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccessPath } from "@/lib/admin-access";
import { useAdminAccess } from "@/components/admin/AdminAccessContext";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/feedback";

/** Keeps a SubAdmin off the pages the nav does not show them — a typed URL, a
 *  stale bookmark, or the edit form of a tournament they are not assigned to.
 *  UX only: the RPCs behind those pages refuse them regardless. Sits inside the
 *  shell so the menu stays usable from the refusal. */
export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const { access } = useAdminAccess();
  const pathname = usePathname();
  if (canAccessPath(access, pathname)) return <>{children}</>;
  return (
    <EmptyState
      title="ไม่มีสิทธิ์เข้าหน้านี้"
      description="หน้านี้ใช้ได้เฉพาะผู้ดูแลระบบ หรือรายการนี้ไม่ได้มอบหมายให้คุณ"
      action={
        <Link href="/admin">
          <Button>กลับหน้าภาพรวม</Button>
        </Link>
      }
    />
  );
}
