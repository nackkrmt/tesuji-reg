"use client";

import { useAdminTournament } from "@/components/admin/AdminTournamentContext";
import { Pill } from "@/components/ui/feedback";

/** Which event the page you are looking at acts on.
 *
 *  Twelve admin pages are scoped by the shell's tournament picker, but only
 *  three ever said which tournament that was — so "ยืนยัน", "ปฏิเสธ",
 *  "ไม่คืนเงิน" and every export were performed against an event named nowhere
 *  on screen. The picker itself sits in the sidebar (desktop) or the top bar
 *  (mobile) and is easy to read past; this repeats the answer next to the work.
 *  Renders nothing when there is no tournament yet. */
export function TournamentScopeNote({
  className,
}: {
  className?: string;
}) {
  const { tournament } = useAdminTournament();
  if (!tournament) return null;
  return (
    <div
      className={
        "mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 " +
        (className ?? "")
      }
    >
      <span className="text-xs text-ink-tertiary">รายการ</span>
      <span className="min-w-0 truncate text-sm font-semibold text-ink">
        {tournament.nameTh}
      </span>
      {tournament.status === "draft" && <Pill tone="neutral" size="sm">ร่าง</Pill>}
      {tournament.status === "closed" && <Pill tone="bad" size="sm">ปิดแล้ว</Pill>}
    </div>
  );
}
