"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { useAdminTournament } from "@/components/admin/AdminTournamentContext";
import { Category, RegistrationKind, RegistrationStatus } from "@/lib/data/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { TextInput } from "@/components/ui/form";
import { EmptyState, StatusBadge } from "@/components/ui/feedback";
import { FilterChip } from "@/components/ui/Chip";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { SectionTitle } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import { cn, formatThb, fullNameEn, fullNameTh } from "@/lib/utils";

type Filter = RegistrationStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "pending_review", label: "รอตรวจสอบ" },
  { value: "confirmed", label: "ยืนยันแล้ว" },
  { value: "rejected", label: "ปฏิเสธ" },
  { value: "pending_payment", label: "รอชำระเงิน" },
  { value: "expired", label: "หมดเวลา" },
];

/** One registered person, flattened out of their registration batch. The
 *  payment fields (batchTotal, slip, referenceCode) belong to the whole batch —
 *  a group shares one transfer — so each row shows the FULL amount to verify. */
interface PersonRow {
  seatId: string;
  batchId: string;
  nameTh: string;
  nameEn: string;
  categoryId: string;
  status: RegistrationStatus;
  referenceCode: string;
  batchTotalThb: number;
  seatCount: number;
  kind: RegistrationKind;
  submitterPhone: string;
}

export default function RegistrationReviewList() {
  const dl = useDataLayer();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("pending_review");
  const [query, setQuery] = useState("");
  /** Batch ids ticked for the bulk confirm (selection is per BATCH — one
   *  transfer pays for every seat on it, so a group can only be accepted or
   *  rejected whole). */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const { tournament, loading: tLoading } = useAdminTournament();
  const tid = tournament?.id;
  // Topic-scoped: without it every unrelated store change (a profile save, an
  // institute edit) re-ran this full admin list.
  const { data: regs, loading } = useLiveQuery(
    (d) => (tid ? d.listRegistrations(tid, filter) : Promise.resolve([])),
    [tid, filter],
    ["registrations"],
  );
  const { data: categories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
    ["categories"],
  );

  // A ticked batch that has left the visible list (filter change, someone else
  // confirmed it) must not stay selected — the sticky bar's count would lie.
  useEffect(() => {
    setPicked(new Set());
  }, [tid, filter]);

  const catMap = useMemo(() => {
    const m: Record<string, Category> = {};
    (categories ?? []).forEach((c) => (m[c.id] = c));
    return m;
  }, [categories]);

  // Flatten batches → one row per person, sorted by Thai name.
  const rows = useMemo<PersonRow[]>(() => {
    const out: PersonRow[] = [];
    for (const { batch, seats } of regs ?? []) {
      for (const s of seats) {
        out.push({
          seatId: s.id,
          batchId: batch.id,
          nameTh: fullNameTh(s),
          nameEn: fullNameEn(s),
          categoryId: s.categoryId,
          status: batch.status,
          referenceCode: batch.referenceCode,
          batchTotalThb: batch.totalAmountThb,
          seatCount: seats.length,
          kind: batch.kind,
          submitterPhone: batch.submitterPhone,
        });
      }
    }
    return out.sort((a, b) => a.nameTh.localeCompare(b.nameTh, "th"));
  }, [regs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.nameTh.toLowerCase().includes(q) ||
        r.nameEn.toLowerCase().includes(q) ||
        r.referenceCode.toLowerCase().includes(q) ||
        r.submitterPhone.includes(q),
    );
  }, [rows, query]);

  // One entry per batch in the visible list: the unit the bulk action acts on.
  const visibleBatches = useMemo(() => {
    const m = new Map<string, { reference: string; seatCount: number; totalThb: number }>();
    for (const r of filtered) {
      if (!m.has(r.batchId))
        m.set(r.batchId, {
          reference: r.referenceCode,
          seatCount: r.seatCount,
          totalThb: r.batchTotalThb,
        });
    }
    return m;
  }, [filtered]);

  // Only the review queue: confirming from the "ปฏิเสธ"/"หมดเวลา" lists is a
  // reopen decision that belongs on the detail page, not a bulk tick.
  const bulkEnabled = filter === "pending_review";
  const pickedList = [...picked].filter((id) => visibleBatches.has(id));
  const pickedSeats = pickedList.reduce(
    (n, id) => n + (visibleBatches.get(id)?.seatCount ?? 0),
    0,
  );
  const pickedThb = pickedList.reduce(
    (n, id) => n + (visibleBatches.get(id)?.totalThb ?? 0),
    0,
  );

  function toggleBatch(batchId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }

  async function runBulkConfirm() {
    if (running || pickedList.length === 0) return;
    setRunning(true);
    setProgress(0);
    const failed: string[] = [];
    let done = 0;
    // Sequential on purpose: confirm_registration is a write per batch, and a
    // hundred parallel RPCs from a phone is how you lose half the responses.
    for (const batchId of pickedList) {
      try {
        await dl.confirmRegistration(batchId, "admin");
        done++;
      } catch {
        failed.push(visibleBatches.get(batchId)?.reference ?? batchId);
      }
      setProgress(done + failed.length);
    }
    setRunning(false);
    setConfirmOpen(false);
    setPicked(new Set());
    toast.show(
      failed.length === 0
        ? `ยืนยันแล้ว ${done} ใบ`
        : `ยืนยันแล้ว ${done} ใบ · ไม่สำเร็จ ${failed.length} ใบ (${failed
            .slice(0, 5)
            .join(", ")}${failed.length > 5 ? "…" : ""}) — ตรวจรายใบอีกครั้ง`,
      failed.length === 0 ? "success" : "error",
    );
  }

  if (tLoading)
    return (
      <div aria-busy="true">
        <SkeletonRows count={5} />
      </div>
    );
  if (!tournament) return <EmptyState title="ยังไม่มีรายการแข่งขัน" />;

  return (
    <div className="space-y-4">
      {/* search */}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <SectionTitle>รายชื่อผู้สมัคร</SectionTitle>
          <span className="flex shrink-0 items-baseline gap-3">
            {bulkEnabled && visibleBatches.size > 0 && (
              <button
                type="button"
                onClick={() =>
                  setPicked(
                    pickedList.length === visibleBatches.size
                      ? new Set()
                      : new Set(visibleBatches.keys()),
                  )
                }
                disabled={running}
                className="focus-ring rounded text-xs font-semibold text-brand-300 hover:text-brand-200 disabled:opacity-50"
              >
                {pickedList.length === visibleBatches.size
                  ? "ล้างที่เลือก"
                  : `เลือกทั้งหมด (${visibleBatches.size} ใบ)`}
              </button>
            )}
            <span className="text-xs text-ink-tertiary">{filtered.length} รายชื่อ</span>
          </span>
        </div>
        <div className="relative mt-2">
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัสใบสมัคร / เบอร์โทร"
            className="pl-10"
          />
        </div>
      </div>

      {/* status filter */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <FilterChip
            key={f.value}
            active={filter === f.value}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </FilterChip>
        ))}
      </div>

      {loading ? (
        <div aria-busy="true">
          <SkeletonRows count={5} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query.trim() ? "ไม่พบรายชื่อที่ค้นหา" : "ไม่มีรายชื่อในหมวดนี้"}
        />
      ) : (
        <>
          <div className="space-y-2.5">
            {filtered.map((r) => {
              const cat = catMap[r.categoryId];
              const on = picked.has(r.batchId);
              return (
                <div key={r.seatId} className="flex items-stretch gap-1.5">
                  {bulkEnabled && (
                    <label className="flex shrink-0 cursor-pointer items-center px-1.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleBatch(r.batchId)}
                        disabled={running}
                        aria-label={`เลือกใบสมัคร ${r.referenceCode}`}
                        className="h-5 w-5 shrink-0 rounded accent-brand-500"
                      />
                    </label>
                  )}
                <Link
                  href={`/admin/registrations/${r.batchId}`}
                  className="focus-ring press block min-w-0 flex-1 rounded-3xl"
                >
                  <Card
                    className={cn(
                      "hover-glass p-4 transition",
                      on && "ring-1 ring-inset ring-brand-400/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-ink">
                            {r.nameTh}
                          </p>
                          <StatusBadge status={r.status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-tertiary">
                          {r.nameEn}
                        </p>
                        <p className="mt-1 text-xs text-ink-tertiary">
                          {cat ? (
                            <span className="font-medium text-brand-300">
                              {cat.code} · {cat.name}
                            </span>
                          ) : (
                            "—"
                          )}
                          <span className="text-ink-faint">
                            {" "}
                            · {r.referenceCode}
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        <div className="text-right">
                          <p className="text-xs text-ink-faint">
                            ยอดที่ต้องโอน
                          </p>
                          <p className="font-bold text-ink">
                            {formatThb(r.batchTotalThb)} ฿
                          </p>
                          {r.seatCount > 1 && (
                            <p className="mt-0.5 text-xs font-medium text-amber-300">
                              กลุ่ม {r.seatCount} คน · ยอดรวม
                            </p>
                          )}
                        </div>
                        <svg
                          className="mt-1 h-4 w-4 shrink-0 text-ink-faint"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="9 6 15 12 9 18" />
                        </svg>
                      </div>
                    </div>
                  </Card>
                </Link>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Sticky bulk bar — floats above the mobile dock, same recipe as the
          tournament form's save bar. */}
      {bulkEnabled && pickedList.length > 0 && (
        <div className="glass-strong sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 lg:bottom-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              เลือก {pickedList.length} ใบ · {pickedSeats} ที่นั่ง
            </p>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="focus-ring rounded text-xs font-medium text-ink-tertiary hover:text-ink-secondary"
            >
              ล้างที่เลือก
            </button>
          </div>
          <Button
            className="h-11 shrink-0 px-5"
            loading={running}
            onClick={() => setConfirmOpen(true)}
          >
            ยืนยัน {pickedList.length} ใบ
          </Button>
        </div>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => !running && setConfirmOpen(false)}
        onConfirm={runBulkConfirm}
        tone="primary"
        loading={running}
        title={`ยืนยันใบสมัคร ${pickedList.length} ใบ`}
        description={tournament.nameTh}
        confirmLabel={running ? `${progress}/${pickedList.length}` : "ยืนยันทั้งหมด"}
      >
        <div className="space-y-2.5">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-ink-secondary">
            <p>
              {pickedSeats} ที่นั่ง · ยอดรวม{" "}
              <b className="text-ink">{formatThb(pickedThb)} ฿</b>
            </p>
            <p className="mt-1 text-ink-tertiary">
              ตรวจสลิปของทุกใบที่เลือกแล้วก่อนกดยืนยัน — การยืนยันแจ้งผู้สมัครว่า
              ชำระเงินครบแล้ว (แก้กลับได้ที่หน้ารายละเอียดของแต่ละใบ)
            </p>
          </div>
          {running && (
            <p className="text-xs font-medium text-brand-300">
              กำลังยืนยัน {progress}/{pickedList.length} — อย่าปิดหน้านี้
            </p>
          )}
        </div>
      </ConfirmSheet>
    </div>
  );
}
