"use client";

import { useEffect, useState } from "react";
import { GoPlayerSource } from "@/lib/data/types";
import { parseGoDatabaseCsv, parseGoDatabaseExcel } from "@/lib/go-database";
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
          Sync จาก Google Sheets (วางลิงก์แล้วกดดึงล่าสุด) หรืออัปโหลดไฟล์ Excel (.xlsx) —
          ใช้จับคู่ชื่อเพื่อยืนยันระดับฝีมือตอนสมัคร · การนำเข้าใหม่จะแทนที่ข้อมูลเดิมของฐานนั้นทั้งหมด
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
  const [url, setUrl] = useState("");

  useEffect(() => {
    let alive = true;
    void dl
      .getGoSheetUrl(source)
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {
        /* not configured / not signed in — leave blank */
      });
    return () => {
      alive = false;
    };
  }, [dl, source]);

  /** Run an import given a producer of parsed rows, with shared busy/result UI. */
  async function runImport(
    produce: () => Promise<{ rows: Parameters<typeof dl.importRankDatabase>[1]; skipped: number }>,
  ) {
    setBusy(true);
    setResult(undefined);
    setError(false);
    try {
      const { rows, skipped } = await produce();
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

  function onSync() {
    void runImport(async () => {
      const { csv } = await dl.fetchGoSheetCsv(source, url.trim() || undefined);
      return parseGoDatabaseCsv(source, csv);
    });
  }

  function onFile(file: File) {
    void runImport(() => parseGoDatabaseExcel(source, file));
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <SectionTitle>ฐาน {label}</SectionTitle>
        {busy && <Spinner className="h-4 w-4" />}
      </div>
      <p className="text-xs text-slate-400">{desc}</p>

      {/* Google Sheets sync */}
      <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
        <label className="block text-xs font-semibold text-slate-500">
          ลิงก์ Google Sheets (แชร์แบบ public / publish to web)
        </label>
        <input
          type="url"
          inputMode="url"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-brand-400"
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          disabled={busy || !url.trim()}
          onClick={onSync}
          className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "กำลัง Sync…" : "Sync จาก Google Sheets"}
        </button>
      </div>

      {/* Excel upload (fallback) */}
      <div className="flex items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-brand-100 px-4 text-sm font-semibold text-brand-800 hover:bg-brand-200">
          {busy ? "กำลังนำเข้า…" : "หรืออัปโหลดไฟล์ .xlsx"}
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

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
