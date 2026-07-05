"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TextInput } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { getAdminSecret } from "@/lib/admin-auth";
import { clearAll } from "@/lib/live/client";

const CLEAR_PHRASE = "ล้างข้อมูล";

/** Wipes ALL live competition data (รุ่น/คู่จับ/ผล/ตารางคะแนน) — reusable across
 *  events, separate from the registration resets in TournamentDangerZone. */
export function LiveDangerZone() {
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  const confirmOk = confirmText.trim() === CLEAR_PHRASE;

  async function runClear() {
    if (!confirmOk || busy) return;
    setBusy(true);
    try {
      await clearAll(getAdminSecret());
      toast.show("ล้างข้อมูลการแข่งขันทั้งหมดแล้ว", "success");
      setConfirmOpen(false);
      setConfirmText("");
    } catch (e) {
      const msg = (e as Error).message.includes("UNAUTHORIZED")
        ? "ไม่มีสิทธิ์ (เข้าสู่ระบบ admin ใหม่)"
        : "ล้างข้อมูลไม่สำเร็จ";
      toast.show(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-rose-200">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-rose-300"
            aria-hidden="true"
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span>ล้างข้อมูลการแข่งขัน (ผลแข่งสด) — ใช้เริ่มงานใหม่</span>
        </p>
        <p className="mt-1 text-xs text-white/55">
          ลบรุ่นแข่ง คู่จับ ผล และตารางคะแนน <b className="text-rose-200">ทั้งหมดถาวร</b> ·
          ใช้เมื่อจบงานหนึ่งแล้วต้องการเริ่มงานถัดไป · ไม่กระทบข้อมูลการสมัคร (คนละส่วน)
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmText("");
            setConfirmOpen(true);
          }}
          className="mt-3 shrink-0 rounded-xl border border-rose-400/40 px-4 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/15"
        >
          ล้างข้อมูลการแข่งขันทั้งหมด
        </button>
      </div>

      <Sheet
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        title="ล้างข้อมูลการแข่งขันทั้งหมด"
        footer={
          <Button
            variant="danger"
            fullWidth
            disabled={!confirmOk}
            loading={busy}
            onClick={runClear}
          >
            ยืนยันล้างถาวร
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            ลบรุ่นแข่ง/คู่จับ/ผล/ตารางคะแนนทั้งหมด — <b>ย้อนกลับไม่ได้</b>
          </p>
          <div>
            <p className="mb-1.5 text-sm text-white/60">พิมพ์คำนี้เพื่อยืนยัน:</p>
            <p className="mb-2 select-all rounded-lg bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white/80">
              {CLEAR_PHRASE}
            </p>
            <TextInput
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`พิมพ์ "${CLEAR_PHRASE}"`}
              invalid={confirmText.length > 0 && !confirmOk}
              autoComplete="off"
            />
          </div>
        </div>
      </Sheet>
    </>
  );
}
