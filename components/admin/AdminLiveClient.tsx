"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { TextInput } from "@/components/ui/form";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { getAdminSecret } from "@/lib/admin-auth";
import { useLive } from "@/lib/live/useLive";
import { isResultDecided } from "@/lib/live/types";
import { clearAll, getToken } from "@/lib/live/client";

const CLEAR_PHRASE = "ล้างข้อมูล";

export function AdminLiveClient() {
  const { divisions, matches, loading, refetch } = useLive();
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    getToken(getAdminSecret())
      .then(setToken)
      .catch(() => setToken(null));
  }, []);

  const decided = matches.filter((m) => isResultDecided(m.result)).length;
  const judgeUrl = token ? `${origin}/judge/${token}` : "";
  const confirmOk = confirmText.trim() === CLEAR_PHRASE;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`คัดลอก${label}แล้ว`, "success");
    } catch {
      toast.show("คัดลอกไม่สำเร็จ", "error");
    }
  }

  async function runClear() {
    if (!confirmOk || busy) return;
    setBusy(true);
    try {
      await clearAll(getAdminSecret());
      toast.show("ล้างข้อมูลการแข่งขันทั้งหมดแล้ว", "success");
      setConfirmOpen(false);
      setConfirmText("");
      refetch();
    } catch (e) {
      const msg = (e as Error).message.includes("UNAUTHORIZED")
        ? "ไม่มีสิทธิ์ (เข้าสู่ระบบ admin ใหม่)"
        : "ล้างข้อมูลไม่สำเร็จ";
      toast.show(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <CenterLoader label="กำลังโหลด…" />;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="รุ่นแข่ง" value={divisions.length} />
        <Stat label="คู่แข่งทั้งหมด" value={matches.length} />
        <Stat label="บันทึกผลแล้ว" value={decided} />
      </div>

      {/* Judge secret link */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
          ลิงก์กรรมการ (ลับ)
        </p>
        <Card className="space-y-3 p-4">
          <p className="text-xs text-white/55">
            แจกลิงก์นี้ให้กรรมการเพื่อบันทึกผล/เช็คชื่อ ·{" "}
            <b className="text-amber-200">อย่าเผยแพร่สู่สาธารณะ</b> ใครมีลิงก์นี้แก้ผลได้
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-white/[0.06] px-3 py-2.5 text-sm text-white/80">
              {judgeUrl || "…"}
            </code>
            <Button
              variant="secondary"
              onClick={() => copy(judgeUrl, "ลิงก์กรรมการ")}
              disabled={!judgeUrl}
              className="h-11 shrink-0 px-4"
            >
              คัดลอก
            </Button>
          </div>
        </Card>
      </section>

      {/* MacMahon config */}
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
          ตั้งค่าโปรแกรม MacMahon (launcher.properties)
        </p>
        <Card className="space-y-2.5 p-4">
          <p className="text-xs text-white/55">
            ใส่ค่าสองบรรทัดนี้ในไฟล์ launcher.properties เพื่อให้ MacMahon ส่งคู่จับ/ผลเข้าระบบ
          </p>
          <ConfigRow label="tesuji.url" value={origin} onCopy={copy} />
          <ConfigRow label="tesuji.token" value={token ?? "…"} onCopy={copy} />
        </Card>
      </section>

      {/* Danger zone: clear all live data (reusable across events) */}
      <section>
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] p-4">
          <p className="text-sm font-semibold text-rose-200">
            ⚠ ล้างข้อมูลการแข่งขัน — ใช้เริ่มงานใหม่
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
            className="mt-3 rounded-xl border border-rose-400/40 px-4 py-2.5 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/15"
          >
            ล้างข้อมูลการแข่งขันทั้งหมด
          </button>
        </div>
      </section>

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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-white/55">{label}</p>
    </Card>
  );
}

function ConfigRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 font-mono text-xs text-white/45">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-lg bg-white/[0.06] px-2.5 py-2 text-xs text-white/80">
        {value}
      </code>
      <button
        onClick={() => onCopy(value, label)}
        className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-medium text-brand-300 transition hover:bg-white/10"
      >
        คัดลอก
      </button>
    </div>
  );
}
