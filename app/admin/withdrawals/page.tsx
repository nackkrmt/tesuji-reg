"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { RefundStatus, REFUND_STATUS_LABEL, Withdrawal } from "@/lib/data/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/form";
import { CenterLoader, EmptyState, Pill } from "@/components/ui/feedback";
import { RefundConfirmSheet } from "@/components/admin/RefundConfirmSheet";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { cn, formatThaiDateTime, formatThb } from "@/lib/utils";

const STATUS_OPTIONS: { value: RefundStatus; label: string }[] = [
  { value: "pending", label: REFUND_STATUS_LABEL.pending },
  { value: "refunded", label: REFUND_STATUS_LABEL.refunded },
  { value: "denied", label: REFUND_STATUS_LABEL.denied },
];

const HEADER_DESC =
  "รายการผู้ถอนตัวทั้งหมด พร้อมข้อมูลบัญชีสำหรับพิจารณาคืนเงิน — การตั้งสถานะ “คืนเงินแล้ว” ต้องแนบสลิปหลักฐานการโอนและจะล็อกถาวร ยอดที่คืนแล้วจะถูกหักออกจากรายได้บนแดชบอร์ด";

export default function AdminWithdrawalsPage() {
  const dl = useDataLayer();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<Withdrawal | null>(null);
  const [slipView, setSlipView] = useState<{ url: string; name: string } | null>(
    null,
  );
  const [slipBusyId, setSlipBusyId] = useState<string | null>(null);

  const { data: tournament, loading: tLoading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
    ["tournament"],
  );
  const tid = tournament?.id;
  const { data: withdrawals, loading } = useLiveQuery(
    (d) => (tid ? d.adminListWithdrawals(tid) : Promise.resolve([])),
    [tid],
    ["withdrawals"],
  );

  const list = useMemo(() => withdrawals ?? [], [withdrawals]);
  const summary = useMemo(() => {
    let pending = 0;
    let refunded = 0;
    let denied = 0;
    let pendingThb = 0;
    let refundedThb = 0;
    for (const w of list) {
      if (w.refundStatus === "pending") {
        pending++;
        pendingThb += w.feeThb;
      } else if (w.refundStatus === "refunded") {
        refunded++;
        refundedThb += w.feeThb;
      } else {
        denied++;
      }
    }
    return { pending, refunded, denied, pendingThb, refundedThb };
  }, [list]);

  async function setStatus(w: Withdrawal, status: RefundStatus) {
    if (status === w.refundStatus || busyId) return;
    // "refunded" needs the slip + permanent-lock confirmation → sheet flow
    if (status === "refunded") {
      setRefundTarget(w);
      return;
    }
    setBusyId(w.id);
    try {
      await dl.adminSetWithdrawalStatus(w.id, status);
    } catch (e) {
      const locked = e instanceof Error && e.message === "LOCKED";
      toast.show(
        locked
          ? "รายการนี้คืนเงินแล้ว ไม่สามารถเปลี่ยนสถานะได้"
          : "อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่",
        "error",
      );
    } finally {
      setBusyId(null);
    }
  }

  // Shown in an in-app sheet (NOT window.open — iOS Safari blocks popups
  // opened after an await, and the mock's data: URLs can't be a top frame).
  async function viewRefundSlip(w: Withdrawal) {
    if (!w.refundSlipUrl || slipBusyId) return;
    setSlipBusyId(w.id);
    try {
      const url = await dl.getRefundSlipUrl(w.refundSlipUrl);
      if (!url) throw new Error("NO_URL");
      setSlipView({ url, name: w.personName });
    } catch {
      toast.show("เปิดสลิปไม่สำเร็จ กรุณาลองใหม่", "error");
    } finally {
      setSlipBusyId(null);
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
        <StatChip
          label="คืนเงินแล้ว"
          value={
            summary.refunded > 0
              ? `${summary.refunded} · ${formatThb(summary.refundedThb)} ฿`
              : `${summary.refunded}`
          }
          tone="good"
        />
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

              {/* refund status control — refunded rows are locked for good */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-white/45">สถานะการคืนเงิน</span>
                {w.refundStatus === "refunded" ? (
                  <span className="flex items-center gap-2.5">
                    {w.refundSlipUrl && (
                      <button
                        type="button"
                        onClick={() => viewRefundSlip(w)}
                        disabled={slipBusyId === w.id}
                        className="text-sm font-medium text-brand-300 underline decoration-brand-300/40 underline-offset-2 transition hover:text-brand-200 disabled:opacity-60"
                      >
                        {slipBusyId === w.id ? "กำลังเปิด…" : "ดูสลิปคืนเงิน"}
                      </button>
                    )}
                    <Pill tone="good">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className="mr-1"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7 10V8a5 5 0 0110 0v2m-11 0h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1z"
                        />
                      </svg>
                      คืนเงินแล้ว · ล็อกแล้ว
                    </Pill>
                  </span>
                ) : (
                  <Segmented
                    options={STATUS_OPTIONS}
                    value={w.refundStatus}
                    onChange={(v) => setStatus(w, v)}
                    className={cn(
                      "w-full sm:w-auto",
                      busyId === w.id && "pointer-events-none opacity-60",
                    )}
                  />
                )}
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

      <RefundConfirmSheet
        open={!!refundTarget}
        withdrawal={refundTarget}
        onClose={() => setRefundTarget(null)}
      />

      {/* refund-slip viewer (signed URL on Supabase, data URL on mock) */}
      <Sheet
        open={!!slipView}
        onClose={() => setSlipView(null)}
        title={slipView ? `สลิปคืนเงิน — ${slipView.name}` : "สลิปคืนเงิน"}
      >
        {slipView && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slipView.url}
            alt="refund slip"
            className="w-full rounded-2xl object-contain ring-1 ring-white/10"
          />
        )}
      </Sheet>
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
