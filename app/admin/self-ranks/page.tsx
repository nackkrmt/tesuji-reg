"use client";

// /admin/self-ranks — people who typed their own Go rank ("ไม่ใช่อันดับนี้" /
// "ไม่อยู่ในรายชื่อ") instead of matching a DAN/KYU/AWARD row. This used to be a
// read-only card at the bottom of /admin/database; it is its own page now so the
// organiser can search it and correct a rank after checking with the player.

import { useMemo, useState } from "react";
import type { SelfDeclaredRank } from "@/lib/data/types";
import { powerToLabel, RANK_OPTIONS } from "@/lib/rank";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { Field, TextInput } from "@/components/ui/form";
import { RowAction } from "@/components/ui/RowAction";
import { Sheet } from "@/components/ui/Sheet";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";

/** Every whitespace-separated term must hit the name, the owner or the phone
 *  (digits only, so "0812345678" finds "081-234-5678"). */
function matches(r: SelfDeclaredRank, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = [
    r.firstNameTh,
    r.lastNameTh,
    r.ownerLabel ?? "",
    r.phone ?? "",
    (r.phone ?? "").replace(/\D/g, ""),
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export default function AdminSelfRanksPage() {
  const { data, loading, error } = useLiveQuery(
    (d) => d.adminListSelfDeclaredRanks(),
    [],
    ["profile", "players", "rankdb"],
  );
  const rows = useMemo(() => data ?? [], [data]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SelfDeclaredRank | null>(null);

  const shown = useMemo(() => rows.filter((r) => matches(r, query)), [rows, query]);

  return (
    <>
      <PageHeader
        title="ระดับฝีมือที่ผู้ใช้กรอกเอง"
        description="รายชื่อที่เลือก “ไม่ใช่อันดับนี้” หรือ “ไม่อยู่ในรายชื่อ” แล้วกรอกระดับเอง (ไม่ได้จับคู่กับฐานข้อมูลทางการ) · ควรตรวจสอบก่อนวันแข่ง"
      />
      <div className="space-y-4">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <TextInput
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ / นามสกุล / ผู้ดูแล / เบอร์โทร"
            aria-label="ค้นหารายชื่อ"
            className="pl-10"
          />
        </div>

        {loading ? (
          <CenterLoader label="กำลังโหลด…" />
        ) : error && !data ? (
          <p className="text-sm text-rose-300">
            {error.message.includes("UNAUTHORIZED")
              ? "ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)"
              : "โหลดรายชื่อไม่สำเร็จ"}
          </p>
        ) : rows.length === 0 ? (
          <EmptyState title="ยังไม่มีรายชื่อที่กรอกระดับเอง" />
        ) : shown.length === 0 ? (
          <EmptyState
            title="ไม่พบ"
            description={`ไม่มีรายชื่อที่ตรงกับ “${query.trim()}”`}
          />
        ) : (
          <>
            <p className="text-xs text-ink-tertiary">
              {shown.length === rows.length
                ? `${rows.length} คน`
                : `แสดง ${shown.length} จาก ${rows.length} คน`}
            </p>
            <ul className="space-y-2">
              {shown.map((r) => (
                <li key={`${r.kind}-${r.id}`}>
                  <Card className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">
                          {r.firstNameTh} {r.lastNameTh}
                        </span>
                        <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                          {powerToLabel(r.powerLevel)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-tertiary">
                        {r.kind === "profile"
                          ? "โปรไฟล์ (สมัครเอง)"
                          : `ผู้เล่นในสังกัด${r.ownerLabel ? ` · ผู้ดูแล ${r.ownerLabel}` : ""}`}
                        {r.phone ? ` · ${r.phone}` : ""}
                      </p>
                    </div>
                    <RowAction onClick={() => setEditing(r)} className="shrink-0">
                      แก้ไขระดับ
                    </RowAction>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {editing && (
        <EditRankSheet
          key={`${editing.kind}-${editing.id}`}
          row={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EditRankSheet({
  row,
  onClose,
}: {
  row: SelfDeclaredRank;
  onClose: () => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const [value, setValue] = useState(
    row.powerLevel == null ? "" : String(row.powerLevel),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const unchanged = value === (row.powerLevel == null ? "" : String(row.powerLevel));

  async function save() {
    if (value === "") return;
    setBusy(true);
    setError(undefined);
    try {
      await dl.adminSetRank(row.kind, row.id, Number(value));
      toast.show(
        `บันทึกระดับ ${row.firstNameTh} ${row.lastNameTh} เป็น ${powerToLabel(Number(value))} แล้ว`,
        "success",
      );
      onClose();
    } catch (e) {
      const err = e as Error & { detail?: string };
      if (err.message === "OFFICIAL_RANK_EXISTS" && err.detail) {
        // The next sync would push the registry's rank back anyway — say so,
        // and preselect it so a second tap records the rank that will stick.
        setValue(err.detail);
        setError(
          `ชื่อนี้มีระดับในฐานข้อมูลทางการแล้ว (${powerToLabel(Number(err.detail))}) — ` +
            "การซิงก์ครั้งถัดไปจะใช้ระดับนั้นเสมอ จึงตั้งเป็นระดับอื่นไม่ได้ " +
            "ถ้าฐานข้อมูลผิด ให้แก้ที่ Google Sheets แล้ว Sync ใหม่",
        );
      } else if (err.message === "UNAUTHORIZED") {
        setError("ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)");
      } else if (
        err.message === "PROFILE_NOT_FOUND" ||
        err.message === "PLAYER_NOT_FOUND"
      ) {
        setError("ไม่พบรายชื่อนี้แล้ว (อาจถูกลบหรือเก็บเข้าคลังไปแล้ว)");
      } else {
        setError(`บันทึกไม่สำเร็จ — ${err.message.slice(0, 160)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="แก้ไขระดับฝีมือ"
      footer={
        <Button
          fullWidth
          onClick={() => void save()}
          loading={busy}
          disabled={value === "" || unchanged}
        >
          บันทึก
        </Button>
      }
    >
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold text-ink">
            {row.firstNameTh} {row.lastNameTh}
          </p>
          <p className="text-xs text-ink-tertiary">
            ระดับที่กรอกไว้: {powerToLabel(row.powerLevel)}
          </p>
        </div>

        <Field label="ระดับฝีมือ">
          <Combobox
            value={value}
            onChange={(v) => {
              setValue(v);
              setError(undefined);
            }}
            options={RANK_OPTIONS}
            placeholder="เลือกระดับ"
            disabled={busy}
          />
        </Field>

        {error && (
          <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}

        <p className="text-xs text-ink-tertiary">
          ชื่อจะยังอยู่ในรายการนี้ เพราะระดับยังไม่ได้มาจากฐานข้อมูลทางการ ·
          ที่นั่งที่สมัครไปแล้วไม่เปลี่ยนตาม — ถ้าระดับใหม่ขัดกับเกณฑ์รุ่น
          จะขึ้นที่หน้าฐานข้อมูล
        </p>
      </div>
    </Sheet>
  );
}
