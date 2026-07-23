"use client";

import { useEffect, useState } from "react";
import { GoPlayerSource, RankSyncSummary } from "@/lib/data/types";
import { bandLabel, powerToLabel } from "@/lib/rank";
import { parseGoDatabaseCsv, parseGoDatabaseExcel } from "@/lib/go-database";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { Card, SectionTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { RowAction } from "@/components/ui/RowAction";
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
    <div className="space-y-5">
      <PageHeader
        title="ฐานข้อมูลระดับฝีมือ"
        description="Sync จาก Google Sheets (วางลิงก์แล้วกดดึงล่าสุด) หรืออัปโหลดไฟล์ Excel (.xlsx) — ใช้จับคู่ชื่อเพื่อยืนยันระดับฝีมือตอนสมัคร · การนำเข้าใหม่จะแทนที่ข้อมูลเดิมของฐานนั้นทั้งหมด"
      />
      {SOURCES.map((s) => (
        <SourceCard key={s.source} {...s} />
      ))}
      <RankSyncCard />
      <SelfDeclaredRanksCard />
      <AwardExemptionsCard />
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
      const summary = await dl.importRankDatabase(source, rows);
      const imported = summary.imported ?? 0;
      const updated = summary.updatedProfiles + summary.updatedPlayers;
      const linked = summary.linkedProfiles + summary.linkedPlayers;
      setResult(
        `นำเข้า ${imported.toLocaleString("th-TH")} รายการ` +
          (skipped ? ` · ข้าม ${skipped} แถวที่ไม่สมบูรณ์` : "") +
          ` · อัปเดตระดับผู้ใช้ ${updated} คน · เชื่อมโยงใหม่ ${linked} คน`,
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
      <p className="text-xs text-white/45">{desc}</p>

      {/* Google Sheets sync */}
      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <label className="block text-xs font-semibold text-white/55">
          ลิงก์ Google Sheets (แชร์แบบ public / publish to web)
        </label>
        <input
          type="url"
          inputMode="url"
          placeholder="https://docs.google.com/spreadsheets/d/…"
          className="h-10 w-full rounded-xl glass-input px-3 text-sm text-white placeholder:text-white/35 outline-none"
          value={url}
          disabled={busy}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy || !url.trim()}
          onClick={onSync}
        >
          {busy ? "กำลัง Sync…" : "Sync จาก Google Sheets"}
        </Button>
      </div>

      {/* Excel upload (fallback) */}
      <div className="flex items-center gap-2">
        <label className={busy ? "cursor-wait" : "cursor-pointer"}>
          {/* `disabled:` never matches a <span>, so dim via state instead */}
          <span
            className={`inline-flex h-9 items-center rounded-xl bg-white/[0.06] px-3.5 text-sm font-semibold text-white/85 ring-1 ring-inset ring-white/12 transition hover:bg-white/[0.1] ${busy ? "opacity-50" : ""}`}
          >
            {busy ? "กำลังนำเข้า…" : "หรืออัปโหลดไฟล์ .xlsx"}
          </span>
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
        <div
          className={
            error
              ? "flex items-start gap-2 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-inset ring-rose-400/20"
              : "flex items-start gap-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/20"
          }
        >
          {error ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          <span>{result}</span>
        </div>
      )}
    </Card>
  );
}

/** Re-sync every stored rank against the canonical registry (runs automatically
 *  after each import; this is the manual trigger + last summary + the seat/band
 *  conflict worklist — seat snapshots are never retro-edited). */
function RankSyncCard() {
  const dl = useDataLayer();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<RankSyncSummary>();
  const { data: conflicts, loading: conflictsLoading } = useLiveQuery(
    (d) => d.adminListRankConflicts(),
    [],
    ["rankdb", "profile", "players", "registrations"],
  );
  const conflictRows = conflicts ?? [];

  async function run() {
    setBusy(true);
    try {
      const s = await dl.adminSyncPlayerRanks();
      setSummary(s);
      toast.show(
        `ซิงก์แล้ว: อัปเดต ${s.updatedProfiles + s.updatedPlayers} คน · เชื่อมโยงใหม่ ${
          s.linkedProfiles + s.linkedPlayers
        } คน`,
        "success",
      );
    } catch (e) {
      const m = (e as Error).message;
      toast.show(
        m === "UNAUTHORIZED"
          ? "ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)"
          : "ซิงก์ระดับไม่สำเร็จ",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <SectionTitle>ซิงก์ระดับฝีมือผู้ใช้กับฐานข้อมูล</SectionTitle>
        {busy && <Spinner className="h-4 w-4" />}
      </div>
      <p className="text-xs text-white/45">
        รันอัตโนมัติหลังนำเข้าฐานทุกครั้ง · ใช้เฉพาะชื่อที่ตรงชัวร์ (ไม่ใช้ชื่อคล้าย) ·
        ไม่พบชื่อ → คงระดับเดิม · ผลจากฐานข้อมูลทับระดับที่ผู้ใช้กรอกเอง ·
        กรณีชื่อซ้ำหลายระดับจะข้ามไว้ให้ตรวจเอง
      </p>

      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? "กำลังซิงก์…" : "ซิงก์ระดับใหม่ทั้งหมด"}
      </Button>

      {summary && (
        <div className="space-y-1 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
          <p>
            <span className="font-semibold">ทะเบียนบุคคล:</span> ทั้งหมด{" "}
            {summary.persons} · กำกวม {summary.ambiguous} · ไม่มีในฐานแล้ว{" "}
            {summary.missing}
          </p>
          <p>
            <span className="font-semibold">โปรไฟล์:</span> อัปเดต{" "}
            {summary.updatedProfiles} · เชื่อมโยงใหม่ {summary.linkedProfiles}
          </p>
          <p>
            <span className="font-semibold">ผู้เล่นในสังกัด:</span> อัปเดต{" "}
            {summary.updatedPlayers} · เชื่อมโยงใหม่ {summary.linkedPlayers}
          </p>
        </div>
      )}

      {/* seats whose occupant's CURRENT rank breaks the division band */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-white/55">
          ที่นั่งที่ระดับปัจจุบันขัดกับเกณฑ์รุ่น
          {conflictRows.length > 0 ? ` (${conflictRows.length})` : ""}
        </p>
        {conflictsLoading ? (
          <p className="text-xs text-white/45">กำลังโหลด…</p>
        ) : conflictRows.length === 0 ? (
          <p className="text-xs text-white/45">ไม่มีที่นั่งที่ขัดแย้ง</p>
        ) : (
          <ul className="space-y-1.5">
            {conflictRows.map((c) => (
              <li
                key={c.seatId}
                className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white/90">
                    {c.firstNameTh} {c.lastNameTh}
                  </span>
                  <span className="shrink-0 text-xs text-white/45">
                    อ้างอิง {c.batchReference}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-white/55">
                  {c.tournamentName} · {c.categoryCode} {c.categoryName} · เกณฑ์:{" "}
                  {bandLabel(c.minPowerLevel, c.maxPowerLevel)}
                </p>
                <p className="mt-0.5 text-xs text-amber-200/90">
                  ตอนสมัคร {powerToLabel(c.seatPowerLevel)} → ปัจจุบัน{" "}
                  {powerToLabel(c.currentPowerLevel)} ·{" "}
                  {c.sourceKind === "self" ? "สมัครเอง" : "ผู้เล่นในสังกัด"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/** People who typed their own Go rank — chose "ไม่ใช่อันดับนี้" (manual override)
 *  or "ไม่อยู่ในรายชื่อ" (not in list) and entered a rank themselves, instead of
 *  matching an official database row. The organizer's review worklist: these
 *  ranks are self-reported, not verified against DAN/KYU/AWARD. */
function SelfDeclaredRanksCard() {
  const { data, loading } = useLiveQuery(
    (d) => d.adminListSelfDeclaredRanks(),
    [],
    ["profile", "players", "rankdb"],
  );
  const rows = data ?? [];

  return (
    <Card className="space-y-3 p-4">
      <SectionTitle>
        ระดับฝีมือที่ผู้ใช้กรอกเอง
        {rows.length > 0 ? ` (${rows.length})` : ""}
      </SectionTitle>
      <p className="text-xs text-white/45">
        รายชื่อที่เลือก “ไม่ใช่อันดับนี้” หรือ “ไม่อยู่ในรายชื่อ” แล้วกรอกระดับเอง
        (ไม่ได้จับคู่กับฐานข้อมูลทางการ) · ควรตรวจสอบก่อนวันแข่ง
      </p>

      {loading ? (
        <p className="text-xs text-white/45">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-white/45">ยังไม่มีรายชื่อที่กรอกระดับเอง</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={`${r.kind}-${r.id}`}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-white/90">
                  {r.firstNameTh} {r.lastNameTh}
                </span>
                <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                  {powerToLabel(r.powerLevel)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-white/45">
                {r.kind === "profile"
                  ? "โปรไฟล์ (สมัครเอง)"
                  : `ผู้เล่นในสังกัด${r.ownerLabel ? ` · ผู้ดูแล ${r.ownerLabel}` : ""}`}
                {r.phone ? ` · ${r.phone}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Manage exemptions from the 1-kyu award ceiling — the override for a Thai-name
 *  false-positive (two different people sharing a normalized name). */
function AwardExemptionsCard() {
  const dl = useDataLayer();
  const toast = useToast();
  const { data: exemptions, loading } = useLiveQuery(
    (d) => d.adminListAwardExemptions(),
    [],
    ["rankdb"],
  );
  const rows = exemptions ?? [];
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!first.trim() || !last.trim()) return;
    setBusy(true);
    try {
      await dl.adminAddAwardExemption(
        first.trim(),
        last.trim(),
        note.trim() || null,
      );
      setFirst("");
      setLast("");
      setNote("");
      toast.show("เพิ่มรายชื่อยกเว้นแล้ว", "success");
    } catch (e) {
      const m = (e as Error).message;
      toast.show(
        m === "UNAUTHORIZED"
          ? "ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)"
          : "เพิ่มไม่สำเร็จ",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await dl.adminRemoveAwardExemption(id);
      toast.show("ลบรายชื่อยกเว้นแล้ว", "success");
    } catch {
      toast.show("ลบไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "h-10 w-full rounded-xl glass-input px-3 text-sm text-white placeholder:text-white/35 outline-none";

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <SectionTitle>ยกเว้นเพดานรางวัล 1 คิว</SectionTitle>
        {busy && <Spinner className="h-4 w-4" />}
      </div>
      <p className="text-xs text-white/45">
        ผู้เล่นที่ได้เหรียญรุ่น 1 คิว ครบ 3 ครั้งแต่ยังไม่ผ่านดั้ง จะถูกระงับการสมัครทุกรุ่นโดยอัตโนมัติ
        · เพิ่มชื่อที่นี่เพื่อยกเว้นเป็นรายบุคคล (เช่น กรณีชื่อ-นามสกุลซ้ำกับผู้เล่นคนอื่น)
      </p>

      {/* add form */}
      <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2">
        <input
          className={inputCls}
          placeholder="ชื่อ (ไทย)"
          value={first}
          disabled={busy}
          onChange={(e) => setFirst(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="นามสกุล (ไทย)"
          value={last}
          disabled={busy}
          onChange={(e) => setLast(e.target.value)}
        />
        <input
          className={`${inputCls} sm:col-span-2`}
          placeholder="หมายเหตุ (ไม่บังคับ) — เช่น เหตุผลที่ยกเว้น"
          value={note}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy || !first.trim() || !last.trim()}
          onClick={() => void add()}
        >
          เพิ่มรายชื่อยกเว้น
        </Button>
      </div>

      {/* list */}
      {loading ? (
        <p className="text-xs text-white/45">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-white/45">ยังไม่มีรายชื่อยกเว้น</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              <div className="min-w-0">
                <span className="text-sm font-semibold text-white/90">
                  {r.firstNameTh} {r.lastNameTh}
                </span>
                {r.note && (
                  <span className="ml-2 text-xs text-white/45">· {r.note}</span>
                )}
              </div>
              <RowAction
                tone="danger"
                onClick={() => void remove(r.id)}
                disabled={busy}
                className="shrink-0 disabled:opacity-50"
              >
                ลบ
              </RowAction>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
