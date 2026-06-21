"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "@/lib/data/store";
import { Category, RegistrationKind, RegistrationStatus } from "@/lib/data/types";
import { Card } from "@/components/ui/Card";
import { TextInput } from "@/components/ui/form";
import { CenterLoader, EmptyState, StatusBadge } from "@/components/ui/feedback";
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
  const [filter, setFilter] = useState<Filter>("pending_review");
  const [query, setQuery] = useState("");

  const { data: tournament, loading: tLoading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  const tid = tournament?.id;
  const { data: regs, loading } = useLiveQuery(
    (d) => (tid ? d.listRegistrations(tid, filter) : Promise.resolve([])),
    [tid, filter],
  );
  const { data: categories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
  );

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

  if (tLoading) return <CenterLoader label="กำลังโหลด…" />;
  if (!tournament) return <EmptyState title="ยังไม่มีรายการแข่งขัน" />;

  return (
    <div className="space-y-4">
      {/* search */}
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">
          🔍
        </span>
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อ / รหัสใบสมัคร / เบอร์โทร"
          className="pl-10"
        />
      </div>

      {/* status filter */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ring-1 ring-inset",
              filter === f.value
                ? "bg-brand-600 text-white ring-brand-400/40"
                : "bg-white/[0.06] text-white/60 ring-white/10 hover:bg-white/10",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <CenterLoader />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={query.trim() ? "ไม่พบรายชื่อที่ค้นหา" : "ไม่มีรายชื่อในหมวดนี้"}
        />
      ) : (
        <>
          <p className="text-xs text-white/45">{filtered.length} รายชื่อ</p>
          <div className="space-y-2.5">
            {filtered.map((r) => {
              const cat = catMap[r.categoryId];
              return (
                <Link key={r.seatId} href={`/admin/registrations/${r.batchId}`}>
                  <Card className="hover-glass p-4 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-semibold text-white/90">
                            {r.nameTh}
                          </p>
                          <StatusBadge status={r.status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-white/45">
                          {r.nameEn}
                        </p>
                        <p className="mt-1 text-xs text-white/55">
                          {cat ? (
                            <span className="font-medium text-brand-300">
                              {cat.code} · {cat.name}
                            </span>
                          ) : (
                            "—"
                          )}
                          <span className="text-white/40">
                            {" "}
                            · {r.referenceCode}
                          </span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-white/40">
                          ยอดที่ต้องโอน
                        </p>
                        <p className="font-bold text-white/90">
                          {formatThb(r.batchTotalThb)} ฿
                        </p>
                        {r.seatCount > 1 && (
                          <p className="mt-0.5 text-[11px] font-medium text-amber-300">
                            กลุ่ม {r.seatCount} คน · ยอดรวม
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
