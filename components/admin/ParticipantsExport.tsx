"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "@/lib/data/store";
import { BatchWithSeats } from "@/lib/data/types";
import { buildCategoryTxtFiles, buildParticipantsCsv } from "@/lib/export";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";

/** "yyyymmdd_HHMM" stamp for download filenames. */
function stampNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(
    d.getHours(),
  )}${p(d.getMinutes())}`;
}

/** Trigger a browser download of a blob. */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ParticipantsExport() {
  const toast = useToast();
  const [includePending, setIncludePending] = useState(false);
  const [busy, setBusy] = useState<"csv" | "txt" | null>(null);

  const { data: tournament } = useLiveQuery((d) => d.getActiveTournament(), []);
  const tid = tournament?.id;

  const { data: categories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
  );
  const { data: regs, loading } = useLiveQuery(
    (d) => (tid ? d.listRegistrations(tid, "all") : Promise.resolve([])),
    [tid],
  );

  // Confirmed competitors only by default; optionally also those awaiting review.
  const selected = useMemo<BatchWithSeats[]>(() => {
    const allow = new Set(
      includePending ? ["confirmed", "pending_review"] : ["confirmed"],
    );
    return (regs ?? []).filter((b) => allow.has(b.batch.status));
  }, [regs, includePending]);

  const personCount = useMemo(
    () => selected.reduce((n, b) => n + b.seats.length, 0),
    [selected],
  );
  const catCount = useMemo(
    () =>
      new Set(selected.flatMap((b) => b.seats.map((s) => s.categoryId))).size,
    [selected],
  );

  const cats = categories ?? [];
  const empty = personCount === 0;

  function exportCsv() {
    try {
      const csv = buildParticipantsCsv(selected, cats);
      download(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
        `รายชื่อผู้เข้าแข่งขัน_${stampNow()}.csv`,
      );
      toast.show(`ดาวน์โหลด CSV แล้ว (${personCount} คน)`, "success");
    } catch (e) {
      toast.show((e as Error).message || "ส่งออกไม่สำเร็จ", "error");
    }
  }

  async function exportTxtZip() {
    setBusy("txt");
    try {
      const files = buildCategoryTxtFiles(selected, cats);
      if (files.length === 0) {
        toast.show("ไม่มีรุ่นที่มีผู้สมัคร", "error");
        return;
      }
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      files.forEach((f) => zip.file(f.filename, f.content));
      const blob = await zip.generateAsync({ type: "blob" });
      download(blob, `MMImport_${stampNow()}.zip`);
      toast.show(`ดาวน์โหลด ${files.length} ไฟล์ (แยกรุ่น) แล้ว`, "success");
    } catch (e) {
      toast.show((e as Error).message || "ส่งออกไม่สำเร็จ", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white/90">
            ส่งออกรายชื่อผู้เข้าแข่งขัน
          </h2>
          <p className="mt-0.5 text-xs text-white/45">
            {loading
              ? "กำลังโหลด…"
              : `${personCount} คน · ${catCount} รุ่น`}
          </p>
        </div>
        <div className="shrink-0">
          <Checkbox
            checked={includePending}
            onChange={setIncludePending}
            label="รวมรายที่รอตรวจสอบ"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <Button
          variant="secondary"
          onClick={exportCsv}
          disabled={empty || loading}
          className="h-auto flex-col items-start gap-0.5 py-3 text-left"
        >
          <span className="text-sm font-semibold">CSV — ข้อมูลครบ</span>
          <span className="text-xs font-normal text-white/45">
            ทุกฟิลด์ ไว้เก็บข้อมูล (เปิดด้วย Excel)
          </span>
        </Button>

        <Button
          variant="secondary"
          onClick={exportTxtZip}
          loading={busy === "txt"}
          disabled={empty || loading}
          className="h-auto flex-col items-start gap-0.5 py-3 text-left"
        >
          <span className="text-sm font-semibold">TXT — แยกรุ่น (MM Import)</span>
          <span className="text-xs font-normal text-white/45">
            ไฟล์ละรุ่น “รหัส_ชื่อรุ่น_MMImport.txt” (zip)
          </span>
        </Button>
      </div>

      {empty && !loading && (
        <p className="mt-3 text-xs text-amber-300">
          ยังไม่มีผู้สมัครที่
          {includePending ? "ยืนยัน/รอตรวจสอบ" : "ยืนยันแล้ว"} — ยังส่งออกไม่ได้
        </p>
      )}
    </Card>
  );
}
