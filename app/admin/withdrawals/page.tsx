"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { RefundStatus, REFUND_STATUS_LABEL, Withdrawal } from "@/lib/data/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/form";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { cn, formatThaiDateTime, formatThb } from "@/lib/utils";

const STATUS_OPTIONS: { value: RefundStatus; label: string }[] = [
  { value: "pending", label: REFUND_STATUS_LABEL.pending },
  { value: "refunded", label: REFUND_STATUS_LABEL.refunded },
  { value: "denied", label: REFUND_STATUS_LABEL.denied },
];

const HEADER_DESC =
  "รายการผู้ถอนตัวทั้งหมด พร้อมข้อมูลบัญชีสำหรับพิจารณาคืนเงิน (ยอดรายได้รวมบนแดชบอร์ดจะไม่ลดลง — การคืนเงินอยู่นอกระบบตามดุลยพินิจทีมงาน)";

export default function AdminWithdrawalsPage() {
  const dl = useDataLayer();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: tournament, loading: tLoading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  const tid = tournament?.id;
  const { data: withdrawals, loading } = useLiveQuery(
    (d) => (tid ? d.adminListWithdrawals(tid) : Promise.resolve([])),
    [tid],
  );

  const list = useMemo(() => withdrawals ?? [], [withdrawals]);
  const summary = useMemo(() => {
    let pending = 0;
    let refunded = 0;
    let denied = 0;
    let pendingThb = 0;
    for (const w of list) {
      if (w.refundStatus === "pending") {
        pending++;
        pendingThb += w.feeThb;
      } else if (w.refundStatus === "refunded") {
        refunded++;
      } else {
        denied++;
      }
    }
    return { pending, refunded, denied, pendingThb };
  }, [list]);

  async function setStatus(w: Withdrawal, status: RefundStatus) {
    if (status === w.refundStatus || busyId) return;
    setBusyId(w.id);
    try {
      await dl.adminSetWithdrawalStatus(w.id, status);
    } catch {
      toast.show("อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (tLoading) return <CenterLoader label="กำลังโหลด…" />;
  if (!tournament) {
    return (
      <>
        <PageHeader title="การถอนตัว" description={HEADER_DESC} />
        <EmptyState title="ยังไม่มีรายการแข่งขัน" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="การถอนตัว" description={HEADER_DESC} />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatChip label="รอดำเนินการ" value={`${summary.pending}`} tone="warn" />
        <StatChip label="ยอดรอพิจารณา" value={`${formatThb(summary.pendingThb)} ฿`} />
        <StatChip label="คืนเงินแล้ว" value={`${summary.refunded}`} tone="good" />
        <StatChip label="ไม่คืนเงิน" value={`${summary.denied}`} tone="bad" />
      </div>

      {loading ? (
        <CenterLoader label="กำลังโหลด…" />
      ) : list.length === 0 ? (
        <EmptyState
          title="ยังไม่มีการถอนตัว"
          description="เมื่อมีผู้ถอนตัว รายการและข้อมูลบัญชีสำหรับคืนเงินจะแสดงที่นี่"
        />
      ) : (
        <div className="space-y-2.5">
          {list.map((w) => (
            <Card key={w.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white/90">{w.personName}</p>
                  <p className="mt-0.5 text-sm text-brand-300">
                    {w.categoryLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-white/45">
                    <Link
                      href={`/admin/registrations/${w.batchId}`}
                      className="underline decoration-white/20 underline-offset-2 hover:text-white/70"
                    >
                      {w.batchReference}
                    </Link>
                    {" · "}
                    {formatThaiDateTime(w.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-white/40">ค่าสมัคร</p>
                  <p className="font-bold text-white/90">
                    {formatThb(w.feeThb)} ฿
                  </p>
                </div>
              </div>

              {/* refund destination */}
              <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                <p className="text-white/80">
                  <span className="text-white/45">ธนาคาร: </span>
                  {w.bankName}
                </p>
                <p className="text-white/80">
                  <span className="text-white/45">เลขบัญชี: </span>
                  {w.bankAccountNo}
                </p>
                <p className="text-white/80">
                  <span className="text-white/45">ชื่อบัญชี: </span>
                  {w.bankAccountName}
                </p>
                {w.reason && (
                  <p className="mt-1 text-white/60">
                    <span className="text-white/45">เหตุผล: </span>
                    {w.reason}
                  </p>
                )}
              </div>

              {/* refund status control */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-white/45">สถานะการคืนเงิน</span>
                <Segmented
                  options={STATUS_OPTIONS}
                  value={w.refundStatus}
                  onChange={(v) => setStatus(w, v)}
                  className={cn(busyId === w.id && "pointer-events-none opacity-60")}
                />
              </div>
              {w.resolvedAt && (
                <p className="mt-1.5 text-[11px] text-white/35">
                  อัปเดตเมื่อ {formatThaiDateTime(w.resolvedAt)}
                  {w.resolvedBy ? ` · โดย ${w.resolvedBy}` : ""}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn" | "good" | "bad";
}) {
  const toneText =
    tone === "good"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "bad"
          ? "text-rose-300"
          : "text-white/90";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <p className="text-xs text-white/45">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold", toneText)}>{value}</p>
    </div>
  );
}
