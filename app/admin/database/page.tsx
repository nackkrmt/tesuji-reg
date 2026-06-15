"use client";

import { useState } from "react";
import { GoPlayerSource } from "@/lib/data/types";
import { parseGoDatabaseExcel } from "@/lib/go-database";
import { useDataLayer } from "@/lib/data/store";
import { Card, SectionTitle } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";

const SOURCES: { source: GoPlayerSource; label: string; desc: string }[] = [
  {
    source: "dan",
    label: "DAN",
    desc: "ผู้สอบผ่านระดับ Dan · คอลัมน์: firstname, lastname, rank, year, diamond, gat",
  },
  {
    source: "kyu",
    label: "KYU",
    desc: "ผู้สอบผ่านระดับ Kyu · คอลัมน์: firstname, lastname, rank, date",
  },
  {
    source: "award",
    label: "AWARD",
    desc: "ผู้ได้รับรางวัล · คอลัมน์: firstname, lastname, rank_in_category, rank_award, category, event_name, date",
  },
];

export default function AdminDatabasePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">ฐานข้อมูลระดับฝีมือ</h1>
        <p className="mt-1 text-sm text-slate-400">
          อัปโหลดไฟล์ Excel (.xlsx) ของแต่ละฐาน — ระบบจะใช้จับคู่ชื่อเพื่อยืนยันระดับฝีมือตอนสมัคร
          การอัปโหลดใหม่จะแทนที่ข้อมูลเดิมของฐานนั้นทั้งหมด
        </p>
      </div>
      {SOURCES.map((s) => (
        <SourceCard key={s.source} {...s} />
      ))}
    </div>
  );
}

function SourceCard({
  source,
  label,
  desc,
}: {
  source: GoPlayerSource;
  label: string;
  desc: string;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();
  const [error, setError] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    setResult(undefined);
    setError(false);
    try {
      const { rows, skipped } = await parseGoDatabaseExcel(source, file);
      const imported = await dl.importRankDatabase(source, rows);
      setResult(
        `นำเข้า ${imported.toLocaleString("th-TH")} รายการ` +
          (skipped ? ` · ข้าม ${skipped} แถวที่ไม่สมบูรณ์` : ""),
      );
      toast.show(`${label}: นำเข้า ${imported} รายการ`, "success");
    } catch (e) {
      const m = (e as Error).message;
      setError(true);
      setResult(m === "UNAUTHORIZED" ? "ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)" : m);
      toast.show("นำเข้าไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-center justify-between">
        <SectionTitle>ฐาน {label}</SectionTitle>
        {busy && <Spinner className="h-4 w-4" />}
      </div>
      <p className="text-xs text-slate-400">{desc}</p>
      <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-brand-100 px-4 text-sm font-semibold text-brand-800 hover:bg-brand-200">
        {busy ? "กำลังนำเข้า…" : "เลือกไฟล์ .xlsx"}
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
      </label>
      {result && (
        <p
          className={
            error ? "text-sm text-rose-600" : "text-sm font-medium text-emerald-600"
          }
        >
          {result}
        </p>
      )}
    </Card>
  );
}
