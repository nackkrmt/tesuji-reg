"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminTournament } from "@/components/admin/AdminTournamentContext";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Segmented } from "@/components/ui/form";
import { Pill } from "@/components/ui/feedback";
import type { Tournament } from "@/lib/data/types";
import type { CopyMode } from "@/lib/copy-from";
import { cn, formatThaiDate } from "@/lib/utils";

/** "คัดลอกจากรายการอื่น" — pick another tournament and pull its กฎ กติกา or
 *  กำหนดการ into the editor of the tournament being edited (lib/copy-from.ts).
 *  The copy is NOT saved here; the editor's own save button does that, so
 *  closing the page without saving undoes a wrong pick. */
export function CopyFromTournamentSheet({
  open,
  onClose,
  kind,
  currentTournamentId,
  hasExisting,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  kind: "rules" | "schedule";
  currentTournamentId: string;
  /** The editor already holds content, so the organiser picks replace/append. */
  hasExisting: boolean;
  /** Load the source into the editor. Resolve true when done (the sheet then
   *  closes), false to keep the sheet open (the caller showed why). */
  onApply: (source: Tournament, mode: CopyMode) => Promise<boolean>;
}) {
  const { tournaments } = useAdminTournament();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<CopyMode>("replace");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedId(null);
    setMode("replace");
    setBusy(false);
  }, [open]);

  const what = kind === "rules" ? "กฎ กติกา" : "กำหนดการ";
  const unit = kind === "rules" ? "หัวข้อ" : "ตาราง";
  const countOf = (t: Tournament) =>
    kind === "rules" ? (t.rulesSections ?? []).length : (t.scheduleGroups ?? []).length;

  // Newest event first: the one worth copying is usually the last one run.
  const others = useMemo(
    () =>
      tournaments
        .filter((t) => t.id !== currentTournamentId)
        .sort((a, b) => (b.competitionDate ?? "").localeCompare(a.competitionDate ?? "")),
    [tournaments, currentTournamentId],
  );
  const selected = others.find((t) => t.id === selectedId) ?? null;

  async function apply() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      if (await onApply(selected, hasExisting ? mode : "replace")) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !busy && onClose()}
      title={`คัดลอก${what}จากรายการอื่น`}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button fullWidth onClick={apply} loading={busy} disabled={!selected}>
            คัดลอกมาใส่
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {others.length === 0 ? (
          <p className="text-sm text-ink-tertiary">ยังไม่มีรายการแข่งขันอื่นให้คัดลอก</p>
        ) : (
          <ul className="space-y-2" role="radiogroup" aria-label="คัดลอกจากรายการ">
            {others.map((t) => {
              const n = countOf(t);
              const isSel = t.id === selectedId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isSel}
                    disabled={n === 0}
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "focus-ring press flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                      isSel
                        ? "border-brand-400/60 bg-brand-500/15"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                      n === 0 && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{t.nameTh}</span>
                      <span className="block text-xs text-ink-tertiary">
                        {t.competitionDate ? formatThaiDate(t.competitionDate) : "ยังไม่กำหนดวันแข่ง"}
                        {t.status === "draft" ? " · แบบร่าง" : ""}
                      </span>
                    </span>
                    <Pill size="sm" tone={n > 0 ? "neutral" : "bad"}>
                      {n > 0 ? `${n} ${unit}` : `ไม่มี${what}`}
                    </Pill>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {hasExisting && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-tertiary">{what}ที่มีอยู่ตอนนี้</p>
            <Segmented<CopyMode>
              label={`ทำอย่างไรกับ${what}ที่มีอยู่`}
              value={mode}
              onChange={setMode}
              className="w-full"
              options={[
                { value: "replace", label: "แทนที่ของเดิม" },
                { value: "append", label: "เพิ่มต่อท้าย" },
              ]}
            />
          </div>
        )}

        {kind === "schedule" && (
          <p className="text-xs text-ink-tertiary">
            ระบบจับคู่รุ่นจาก<b className="text-ink-secondary">ชื่อรุ่น</b> (ไม่ดูรหัสรุ่น เพราะแต่ละรายการเรียงเลขไม่เหมือนกัน)
            รุ่นที่ชื่อไม่ตรงกับรายการนี้จะไม่ถูกเลือกให้ — ระบบจะบอกว่ารุ่นไหนบ้าง
          </p>
        )}
        <p className="text-xs text-ink-tertiary">
          คัดลอกมาไว้ในหน้าแก้ไขก่อน <b className="text-ink-secondary">ยังไม่บันทึก</b> จนกว่าจะกดบันทึกด้านล่าง
        </p>
      </div>
    </Sheet>
  );
}
