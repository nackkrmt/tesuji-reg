"use client";

import { useLiveQuery } from "@/lib/data/store";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { TournamentDangerZone } from "@/components/admin/TournamentDangerZone";

export default function AdminResetPage() {
  const { data: tournament, loading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  if (loading) return <CenterLoader label="กำลังโหลด…" />;
  if (!tournament)
    return (
      <EmptyState
        title="ยังไม่มีรายการแข่งขัน"
        description="ไม่มีอะไรให้รีเซ็ต — สร้างรายการแข่งที่เมนู “ทัวร์นาเมนต์” ก่อน"
      />
    );
  return <TournamentDangerZone tournament={tournament} />;
}
