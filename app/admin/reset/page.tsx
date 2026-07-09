"use client";

import { useLiveQuery } from "@/lib/data/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { CenterLoader } from "@/components/ui/feedback";
import { ResetChecklist } from "@/components/admin/ResetChecklist";

export default function AdminResetPage() {
  // Only decorates the "รายการแข่งทั้งหมด" row — the checklist itself works with
  // no tournament (all wipes are table-wide + idempotent), so no EmptyState gate:
  // it would brick this page right after deleting the tournament.
  const { data: tournament, loading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  if (loading) return <CenterLoader label="กำลังโหลด…" />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="รีเซ็ต / ล้างข้อมูล"
        description="เลือกกลุ่มข้อมูลที่ต้องการลบถาวรหลังจบงาน — ใช้ด้วยความระมัดระวัง"
      />
      <ResetChecklist activeTournamentName={tournament?.nameTh ?? null} />
    </div>
  );
}
