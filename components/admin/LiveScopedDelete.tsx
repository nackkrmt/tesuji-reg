"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/form";
import { RowAction } from "@/components/ui/RowAction";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { getAdminSecret } from "@/lib/admin-auth";
import { useLive } from "@/lib/live/useLive";
import { isResultDecided, roundsOf } from "@/lib/live/types";
import { deleteDivision, deleteRound } from "@/lib/live/client";

/** The reset page's scalpel, next to its sledgehammer.
 *
 *  The checklist below it deletes by GROUP: ticking "ข้อมูลแข่งสด" wipes every
 *  division, pairing, wall list and announcement of the tournament at once.
 *  What an organizer actually needs mid-event is narrower — one รุ่น uploaded
 *  under the wrong name, one รอบ paired from the wrong file — and doing that
 *  through the checklist means wiping the whole board and re-exporting every
 *  division from MacMahon.
 *
 *  Both actions here touch ONLY the live board:
 *    • ลบรอบนี้  → live_delete_round     (that round's pairings + results)
 *    • ลบทั้งรุ่น → live_delete_division  (every round + the wall list, cascade)
 *  Registrations, categories, judges and the tournament's token are never
 *  touched, and MacMahon re-creates whatever it re-exports.
 *
 *  A copy of the round delete also lives on /admin/live, where it belongs to
 *  the during-the-event flow; this one is the after-the-fact cleanup, scoped
 *  and spelled out. */
export function LiveScopedDelete({ tournamentId }: { tournamentId: string | null }) {
  const { divisions, matches, standings, loading, refetch } = useLive(tournamentId);
  const toast = useToast();
  const [divisionId, setDivisionId] = useState("");
  const [round, setRound] = useState("");
  const [confirm, setConfirm] = useState<null | "round" | "division">(null);
  const [busy, setBusy] = useState(false);

  // Follow the picker: a division that vanished (deleted here, or the admin
  // switched tournament) must not leave a stale id selected behind.
  useEffect(() => {
    if (divisions.length === 0) {
      if (divisionId) setDivisionId("");
      return;
    }
    if (!divisions.some((d) => d.id === divisionId)) {
      setDivisionId(divisions[0].id);
      setRound("");
    }
  }, [divisions, divisionId]);

  const division = divisions.find((d) => d.id === divisionId) ?? null;
  const divMatches = matches.filter((m) => m.divisionId === divisionId);
  const rounds = roundsOf(divMatches);
  const activeRound = round && rounds.includes(round) ? round : (rounds[0] ?? "");
  const roundMatches = divMatches.filter((m) => m.round === activeRound);
  const hasStanding = standings.some((s) => s.divisionId === divisionId);
  const decided = (rows: typeof divMatches) =>
    rows.filter((m) => isResultDecided(m.result)).length;

  async function run(what: "round" | "division") {
    if (!division) return;
    setBusy(true);
    try {
      if (what === "round") {
        await deleteRound(getAdminSecret(), division.id, activeRound);
        toast.show(`ลบรอบ ${activeRound} ของ ${division.name} แล้ว`, "success");
        setRound("");
      } else {
        await deleteDivision(getAdminSecret(), division.id);
        toast.show(`ลบรุ่น ${division.name} แล้ว`, "success");
        setDivisionId("");
        setRound("");
      }
      setConfirm(null);
      refetch();
    } catch (e) {
      // UNAUTHORIZED here means the session is no longer an admin — say that
      // rather than "ลบไม่สำเร็จ", which sent people hunting for a data problem.
      const raw = e instanceof Error ? e.message : String(e);
      toast.show(
        raw.includes("UNAUTHORIZED")
          ? "ไม่มีสิทธิ์ (เข้าสู่ระบบด้วยบัญชี admin ใหม่)"
          : `ลบไม่สำเร็จ (${raw.slice(0, 80)})`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <SectionTitle>ลบเฉพาะบางส่วน — กระดานผลสด</SectionTitle>
        <p className="mt-1 text-sm text-ink-secondary">
          ลบทีละรุ่นหรือทีละรอบ โดยไม่แตะใบสมัคร รุ่นที่เปิดรับสมัคร กรรมการ
          หรือ token ของรายการ · อัปโหลดใหม่จาก MacMahon ได้ทุกเมื่อ
        </p>
      </div>

      {loading ? (
        <SkeletonRows count={2} />
      ) : !tournamentId ? (
        <p className="text-sm text-ink-tertiary">เลือกรายการแข่งบนหัวจอก่อน</p>
      ) : divisions.length === 0 ? (
        <p className="text-sm text-ink-tertiary">
          รายการนี้ยังไม่มีรุ่นบนกระดาน (รุ่นจะขึ้นเมื่อ MacMahon กด Export Pairings)
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              aria-label="รุ่นแข่ง"
              value={divisionId}
              onChange={(e) => {
                setDivisionId(e.target.value);
                setRound("");
              }}
              className="sm:w-64"
            >
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} — {d.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="รอบแข่ง"
              value={activeRound}
              onChange={(e) => setRound(e.target.value)}
              className="sm:w-32"
              disabled={rounds.length === 0}
            >
              {rounds.length === 0 ? (
                <option value="">ไม่มีรอบ</option>
              ) : (
                rounds.map((r) => (
                  <option key={r} value={r}>
                    รอบ {r}
                  </option>
                ))
              )}
            </Select>
            <div className="flex gap-2 sm:ml-auto">
              <RowAction
                tone="danger"
                onClick={() => setConfirm("round")}
                disabled={busy || roundMatches.length === 0}
                className="disabled:pointer-events-none disabled:opacity-40"
              >
                🗑 ลบรอบนี้
              </RowAction>
              <RowAction
                tone="danger"
                onClick={() => setConfirm("division")}
                disabled={busy || !division}
                className="disabled:pointer-events-none disabled:opacity-40"
              >
                🗑 ลบทั้งรุ่น
              </RowAction>
            </div>
          </div>

          <p className="text-xs text-ink-tertiary">
            {division ? (
              <>
                รุ่นนี้มี {rounds.length} รอบ · {divMatches.length} คู่ ·{" "}
                {hasStanding ? "มีตารางคะแนน" : "ยังไม่มีตารางคะแนน"}
                {activeRound
                  ? ` · รอบ ${activeRound}: ${roundMatches.length} คู่ (มีผลแล้ว ${decided(roundMatches)})`
                  : ""}
              </>
            ) : null}
          </p>
        </>
      )}

      <ConfirmSheet
        open={confirm === "round"}
        onClose={() => setConfirm(null)}
        onConfirm={() => run("round")}
        loading={busy}
        title={`ลบรอบ ${activeRound} ของ ${division?.name ?? ""}`}
        description="ลบคู่จับของรอบนี้ทุกโต๊ะ รวมผลที่กรรมการบันทึกไว้ ย้อนกลับไม่ได้ (รอบอื่นยังอยู่)"
        confirmLabel="ลบรอบนี้"
      >
        <ul className="list-inside list-disc space-y-1 text-sm text-ink-secondary">
          <li>คู่จับ {roundMatches.length} โต๊ะ</li>
          <li>ผลที่กรรมการบันทึกแล้ว {decided(roundMatches)} โต๊ะ</li>
          <li>รอบอื่นและตารางคะแนนของรุ่นนี้ไม่ถูกแตะ</li>
          <li>อัปโหลดรอบนี้ใหม่จาก MacMahon ได้ทันที</li>
        </ul>
      </ConfirmSheet>

      <ConfirmSheet
        open={confirm === "division"}
        onClose={() => setConfirm(null)}
        onConfirm={() => run("division")}
        loading={busy}
        title={`ลบรุ่น ${division?.name ?? ""} ออกจากกระดาน`}
        description="ลบทั้งรุ่นออกจากกระดานผลสด ย้อนกลับไม่ได้"
        confirmLabel="ลบทั้งรุ่น"
      >
        <ul className="list-inside list-disc space-y-1 text-sm text-ink-secondary">
          <li>
            คู่จับทุกรอบ {divMatches.length} โต๊ะ ({rounds.length} รอบ) · มีผลแล้ว{" "}
            {decided(divMatches)} โต๊ะ
          </li>
          <li>{hasStanding ? "ตารางคะแนนของรุ่นนี้" : "ไม่มีตารางคะแนนให้ลบ"}</li>
          <li>
            กรรมการที่ตั้งรุ่นนี้เป็นรุ่นเริ่มต้นจะกลับไปไม่มีรุ่นเริ่มต้น — ตัวกรรมการเองไม่ถูกลบ
          </li>
          <li>ใบสมัครและรุ่นที่เปิดรับสมัครไม่เกี่ยวข้องกัน ไม่ถูกแตะ</li>
          <li>กด Export Pairings จาก MacMahon อีกครั้ง รุ่นนี้จะกลับมาพร้อมคู่จับ</li>
        </ul>
      </ConfirmSheet>
    </Card>
  );
}
