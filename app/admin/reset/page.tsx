"use client";

import { useLiveQuery } from "@/lib/data/store";
import { useAdminTournament } from "@/components/admin/AdminTournamentContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { CenterLoader } from "@/components/ui/feedback";
import { ResetChecklist } from "@/components/admin/ResetChecklist";
import { LiveScopedDelete } from "@/components/admin/LiveScopedDelete";

export default function AdminResetPage() {
  // Only decorates the "รายการแข่งทั้งหมด" row — the checklist itself works with
  // no tournament (all wipes are table-wide + idempotent), so no EmptyState gate:
  // it would brick this page right after deleting the tournament.
  const { tournament, loading } = useAdminTournament();
  if (loading) return <CenterLoader label="กำลังโหลด…" />;
  return (
    <div className="space-y-6">
      <PageHeader
        title="รีเซ็ต / ล้างข้อมูล"
        description="ลบทีละรุ่น/ทีละรอบบนกระดานผลสด หรือเลือกกลุ่มข้อมูลที่ต้องการลบถาวรหลังจบงาน — ใช้ด้วยความระมัดระวัง"
      />
      {/* Scalpel first: the narrow, recoverable deletes an organizer reaches for
          mid-event. The whole-group checklist below is the end-of-event tool. */}
      <LiveScopedDelete tournamentId={tournament?.id ?? null} />
      <ResetChecklist
        tournamentId={tournament?.id ?? null}
        activeTournamentName={tournament?.nameTh ?? null}
      />
    </div>
  );
}
