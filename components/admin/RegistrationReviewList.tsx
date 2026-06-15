"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "@/lib/data/store";
import { RegistrationStatus } from "@/lib/data/types";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState, StatusBadge } from "@/components/ui/feedback";
import { cn, formatThaiDateTime, formatThb, fullNameTh } from "@/lib/utils";

type Filter = RegistrationStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "pending_review", label: "รอตรวจสอบ" },
  { value: "confirmed", label: "ยืนยันแล้ว" },
  { value: "rejected", label: "ปฏิเสธ" },
  { value: "pending_payment", label: "รอชำระเงิน" },
  { value: "expired", label: "หมดเวลา" },
];

export default function RegistrationReviewList() {
  const [filter, setFilter] = useState<Filter>("pending_review");
  const { data: tournament, loading: tLoading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  const tid = tournament?.id;
  const { data: regs, loading } = useLiveQuery(
    (d) => (tid ? d.listRegistrations(tid, filter) : Promise.resolve([])),
    [tid, filter],
  );

  if (tLoading) return <CenterLoader label="กำลังโหลด…" />;
  if (!tournament)
    return <EmptyState title="ยังไม่มีรายการแข่งขัน" />;

  return (
    <div className="space-y-4">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.value
                ? "bg-brand-700 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <CenterLoader />
      ) : (regs?.length ?? 0) === 0 ? (
        <EmptyState title="ไม่มีใบสมัครในหมวดนี้" />
      ) : (
        <div className="space-y-3">
          {regs!.map(({ batch, seats }) => (
            <Link key={batch.id} href={`/admin/registrations/${batch.id}`}>
              <Card className="p-4 transition hover:border-brand-300 hover:shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-500">
                        {batch.referenceCode}
                      </span>
                      <StatusBadge status={batch.status} />
                    </div>
                    <p className="mt-1 truncate font-semibold text-slate-800">
                      {seats[0] ? fullNameTh(seats[0]) : "—"}
                      {seats.length > 1 && (
                        <span className="font-normal text-slate-400">
                          {" "}
                          และอีก {seats.length - 1} คน
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {batch.kind === "group" ? "กลุ่ม" : "เดี่ยว"} ·{" "}
                      {seats.length} คน · โทร {batch.submitterPhone}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-slate-800">
                      {formatThb(batch.totalAmountThb)} ฿
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatThaiDateTime(batch.createdAt)}
                    </p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
