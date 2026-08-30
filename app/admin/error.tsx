"use client";

import { useEffect } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/Button";

/** Scoped to the admin segment so a crash inside one page keeps the shell —
 *  sidebar, tournament switcher and logout stay reachable. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      title="หน้านี้ทำงานผิดพลาด"
      description="เกิดข้อผิดพลาดชั่วคราวในหน้านี้ ลองใหม่อีกครั้ง หรือกลับไปหน้าแดชบอร์ด ข้อมูลที่บันทึกไปแล้วไม่ได้รับผลกระทบ"
      action={
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={reset}>ลองใหม่</Button>
          <Link href="/admin">
            <Button variant="secondary">กลับแดชบอร์ด</Button>
          </Link>
        </div>
      }
    />
  );
}
