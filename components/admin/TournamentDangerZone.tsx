"use client";

import { useState } from "react";
import { useDataLayer } from "@/lib/data/store";
import { Tournament } from "@/lib/data/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { TextInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";

function resetError(msg: string): string {
  if (msg.includes("CONFIRM_MISMATCH")) return "ชื่อที่พิมพ์ไม่ตรงกับชื่อรายการ";
  if (msg.includes("TOURNAMENT_NOT_FOUND")) return "ไม่พบรายการแข่งขัน";
  if (msg.includes("UNAUTHORIZED")) return "ไม่มีสิทธิ์ (เข้าสู่ระบบ admin ใหม่)";
  return "ดำเนินการไม่สำเร็จ";
}

type ResetAction = "registrations" | "categories" | "tournament";
const RESET_ACTIONS: { key: ResetAction; label: string; desc: string }[] = [
  {
    key: "registrations",
    label: "ล้างใบสมัครทั้งหมด",
    desc: "ลบใบสมัคร/ผู้สมัครทั้งหมด และคืนที่นั่งเป็น 0 — เก็บรายการแข่งและรุ่นไว้ใช้ต่อ",
  },
  {
    key: "categories",
    label: "ลบรุ่นทั้งหมด",
    desc: "ลบรุ่นการแข่งขันทั้งหมด + ใบสมัครที่เกี่ยวข้อง — เก็บเฉพาะตัวรายการแข่ง",
  },
  {
    key: "tournament",
    label: "ลบทัวร์นาเมนต์ทั้งหมด",
    desc: "ลบรายการแข่ง + รุ่น + ใบสมัคร ทั้งหมด เพื่อเริ่มงานใหม่หมด",
  },
];

/** Guarded post-event reset tools (own page). Every action needs the tournament
 *  name typed exactly before it will run; the server re-checks it too. */
export function TournamentDangerZone({ tournament }: { tournament: Tournament }) {
  const dl = useDataLayer();
  const toast = useToast();
  const [action, setAction] = useState<ResetAction | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const current = RESET_ACTIONS.find((a) => a.key === action) ?? null;
  const confirmOk = confirmText.trim() === tournament.nameTh.trim();

  function closeSheet() {
    if (busy) return;
    setAction(null);
    setConfirmText("");
  }

  async function run() {
    if (!action || !confirmOk || busy) return;
    setBusy(true);
    try {
      let msg = "";
      if (action === "registrations") {
        const n = await dl.clearRegistrations(tournament.id, confirmText);
        msg = `ล้างใบสมัครแล้ว (${n} ใบ)`;
      } else if (action === "categories") {
        const n = await dl.clearCategories(tournament.id, confirmText);
        msg = `ลบรุ่นแล้ว (${n} รุ่น)`;
      } else {
        await dl.deleteTournament(tournament.id, confirmText);
        msg = "ลบทัวร์นาเมนต์แล้ว";
      }
      toast.show(msg, "success");
      setAction(null);
      setConfirmText("");
    } catch (e) {
      toast.show(resetError((e as Error).message), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-rose-200">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-rose-300"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
          รีเซ็ตหลังจบงาน — ลบข้อมูลถาวร
        </p>
        <p className="mt-1 text-xs text-white/55">
          เครื่องมือเหล่านี้ <b className="text-rose-200">ลบข้อมูลถาวร ย้อนกลับไม่ได้</b> ·
          ต้องพิมพ์ชื่อรายการยืนยันก่อนทุกครั้ง · สถาบัน/คำค้นเป็นข้อมูลกลาง ไม่ถูกลบ
        </p>
        <p className="mt-2 text-xs text-white/45">
          รายการปัจจุบัน:{" "}
          <b className="text-white/75">{tournament.nameTh}</b>
        </p>
      </div>

      <div className="space-y-2.5">
        {RESET_ACTIONS.map((a) => (
          <Card key={a.key} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white/90">{a.label}</p>
              <p className="mt-0.5 text-xs text-white/45">{a.desc}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setConfirmText("");
                setAction(a.key);
              }}
              className="shrink-0 rounded-xl border border-rose-400/40 px-4 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/15"
            >
              เลือก
            </button>
          </Card>
        ))}
      </div>

      <Sheet
        open={!!action}
        onClose={closeSheet}
        title={current?.label ?? ""}
        footer={
          <Button
            variant="danger"
            fullWidth
            disabled={!confirmOk}
            loading={busy}
            onClick={run}
          >
            ยืนยันลบถาวร
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {current?.desc} — <b>ลบถาวร ย้อนกลับไม่ได้</b>
          </p>
          <div>
            <p className="mb-1.5 text-sm text-white/60">
              พิมพ์ชื่อรายการให้ตรงเพื่อยืนยัน:
            </p>
            <p className="mb-2 select-all rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/80">
              {tournament.nameTh}
            </p>
            <TextInput
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="พิมพ์ชื่อรายการที่นี่"
              invalid={confirmText.length > 0 && !confirmOk}
              autoComplete="off"
            />
          </div>
        </div>
      </Sheet>
    </div>
  );
}
