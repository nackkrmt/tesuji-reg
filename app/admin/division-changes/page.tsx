"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import {
  AdminResolveDivisionChangeResult,
  DivisionChange,
  DIVISION_CHANGE_STATUS_LABEL,
} from "@/lib/data/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/form";
import { CenterLoader, EmptyState, Pill } from "@/components/ui/feedback";
import { DivisionRefundSheet } from "@/components/admin/DivisionRefundSheet";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { cn, formatThaiDateTime, formatThb } from "@/lib/utils";

const HEADER_DESC =
  "คำขอเปลี่ยนรุ่นที่มีส่วนต่างค่าสมัคร — จ่ายเพิ่ม: ตรวจสลิปแล้วอนุมัติ รุ่นจะย้ายเมื่ออนุมัติ · คืนเงิน: โอนคืนแล้วแนบสลิปยืนยัน (ล็อกถาวร) — แนะนำให้ยืนยันใบสมัคร (ตรวจสลิปหลัก) ก่อนอนุมัติคำขอจ่ายเพิ่ม เพราะยอดใบสมัครจะเปลี่ยนตอนอนุมัติ";

type ResolveFailure = Exclude<AdminResolveDivisionChangeResult, { ok: true }>;

/** Thai toast copy for every resolve failure (shared by all action paths). */
function describeResolveError(res: ResolveFailure): string {
  switch (res.error) {
    case "INSUFFICIENT_SEATS":
      return "รุ่นปลายทางเต็มแล้ว — ปฏิเสธคำขอหรือเพิ่มความจุก่อน";
    case "ALREADY_WITHDRAWN":
      return "ที่นั่งนี้ถอนตัวไปแล้ว — ปฏิเสธคำขอแทน";
    case "FEE_CHANGED":
      return `ค่าสมัครรุ่นปลายทางถูกแก้หลังส่งคำขอ (${formatThb(res.requestedFeeThb)} → ${formatThb(res.currentFeeThb)} ฿) — ปฏิเสธคำขอแล้วให้ผู้เล่นส่งใหม่`;
    case "BATCH_NOT_ACTIVE":
      return "ใบสมัครไม่อยู่ในสถานะยืนยัน/รอตรวจแล้ว จึงแก้ไขไม่ได้";
    case "SEAT_NOT_FOUND":
      return "ไม่พบที่นั่งนี้แล้ว (อาจถูกลบ) — ปฏิเสธคำขอแทน";
    case "CATEGORY_NOT_FOUND":
      return "ไม่พบรุ่นปลายทางแล้ว (อาจถูกลบ) — ปฏิเสธคำขอแทน";
    case "LOCKED":
      return "รายการนี้คืนเงินแล้ว ไม่สามารถเปลี่ยนได้";
    case "ALREADY_RESOLVED":
      return "รายการนี้ถูกดำเนินการไปแล้ว";
    case "SLIP_REQUIRED":
      return "กรุณาแนบสลิปหลักฐานการโอนคืน";
    case "NOT_FOUND":
      return "ไม่พบรายการ";
    case "RANK_NOT_ELIGIBLE":
      return `${res.personLabel} ระดับฝีมือไม่ตรงเกณฑ์รุ่น ${res.categoryName} — ปฏิเสธคำขอ`;
    case "RANK_REQUIRED":
      return `${res.personLabel} ยังไม่มีระดับฝีมือ จึงลงรุ่นนี้ไม่ได้ — ปฏิเสธคำขอ`;
    case "AGE_NOT_ELIGIBLE":
      return `${res.personLabel} อายุไม่ตรงเกณฑ์รุ่น ${res.categoryName} — ปฏิเสธคำขอ`;
    case "DUPLICATE_REGISTRATION":
      return `${res.personLabel} มีชื่อในรุ่น ${res.categoryName} อยู่แล้ว — ปฏิเสธคำขอ`;
    case "COMBINATION_NOT_ALLOWED":
      return `${res.personLabel} ลงรุ่น ${res.categoryName} ควบกับ ${res.otherCategoryName} ไม่ได้ — ปฏิเสธคำขอ`;
    case "AWARD_LIMIT_REACHED":
      return `${res.personLabel} ติดเพดานรางวัล 1 คิว (${res.awardCount} รางวัล) — ปฏิเสธคำขอ`;
    default:
      return "ดำเนินการไม่สำเร็จ กรุณาลองใหม่";
  }
}

export default function AdminDivisionChangesPage() {
  const dl = useDataLayer();
  const toast = useToast();

  const [approveTarget, setApproveTarget] = useState<DivisionChange | null>(
    null,
  );
  const [refundTarget, setRefundTarget] = useState<DivisionChange | null>(null);
  const [rejectTarget, setRejectTarget] = useState<DivisionChange | null>(null);
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
  const { data: changes, loading } = useLiveQuery(
    (d) => (tid ? d.adminListDivisionChanges(tid) : Promise.resolve([])),
    [tid],
    ["divisionChanges"],
  );

  const list = useMemo(() => changes ?? [], [changes]);
  const summary = useMemo(() => {
    let pending = 0;
    let collectThb = 0; // pending upgrades — money to verify
    let refundThb = 0; // pending downgrades — money to send back
    let done = 0;
    let rejected = 0;
    for (const c of list) {
      if (c.status === "pending") {
        pending++;
        if (c.direction === "upgrade") collectThb += c.amountThb;
        else refundThb += c.amountThb;
      } else if (c.status === "rejected") {
        rejected++;
      } else {
        done++;
      }
    }
    return { pending, collectThb, refundThb, done, rejected };
  }, [list]);

  function onResolveError(res: ResolveFailure) {
    toast.show(describeResolveError(res), "error");
  }

  // Shown in an in-app sheet (NOT window.open — iOS Safari blocks popups
  // opened after an await, and the mock's data: URLs can't be a top frame).
  async function viewSlip(c: DivisionChange, ref: string | null, kind: string) {
    if (!ref || slipBusyId) return;
    setSlipBusyId(c.id);
    try {
      const url = await dl.getRefundSlipUrl(ref);
      if (!url) throw new Error("NO_URL");
      setSlipView({ url, name: `${kind} — ${c.personName}` });
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
        <PageHeader title="เปลี่ยนรุ่น" description={HEADER_DESC} />
        <EmptyState title="ยังไม่มีรายการแข่งขัน" />
      </>
    );
  }

  return (
    <>
      <PageHeader title="เปลี่ยนรุ่น" description={HEADER_DESC} />

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatChip label="รอดำเนินการ" value={`${summary.pending}`} tone="warn" />
        <StatChip
          label="ยอดรอเก็บเพิ่ม"
          value={`${formatThb(summary.collectThb)} ฿`}
        />
        <StatChip
          label="ยอดรอโอนคืน"
          value={`${formatThb(summary.refundThb)} ฿`}
        />
        <StatChip
          label="เสร็จสิ้น / ปฏิเสธ"
          value={`${summary.done} / ${summary.rejected}`}
          tone="good"
        />
      </div>

      {loading ? (
        <CenterLoader label="กำลังโหลด…" />
      ) : list.length === 0 ? (
        <EmptyState
          title="ยังไม่มีคำขอเปลี่ยนรุ่น"
          description="เมื่อผู้สมัครขอย้ายไปรุ่นที่ค่าสมัครต่างจากเดิม คำขอจะแสดงที่นี่"
        />
      ) : (
        <div className="space-y-2.5">
          {list.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-white/90">{c.personName}</p>
                  <p className="mt-0.5 text-sm text-brand-300">
                    {c.fromCategoryLabel} → {c.toCategoryLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-white/45">
                    <Link
                      href={`/admin/registrations/${c.batchId}`}
                      className="underline decoration-white/20 underline-offset-2 hover:text-white/70"
                    >
                      {c.batchReference}
                    </Link>
                    {" · "}
                    {formatThaiDateTime(c.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Pill tone={c.direction === "upgrade" ? "warn" : "neutral"}>
                    {c.direction === "upgrade" ? "จ่ายเพิ่ม" : "คืนเงิน"}
                  </Pill>
                  <p className="mt-1 font-bold text-white/90">
                    {formatThb(c.amountThb)} ฿
                  </p>
                </div>
              </div>

              {/* upgrade: the player's transfer slip · downgrade: refund destination */}
              {c.direction === "upgrade" ? (
                <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <span className="text-white/45">
                    สลิปโอนส่วนต่างจากผู้สมัคร
                  </span>
                  <button
                    type="button"
                    onClick={() => viewSlip(c, c.paymentSlipUrl, "สลิปผู้สมัคร")}
                    disabled={slipBusyId === c.id || !c.paymentSlipUrl}
                    className="font-medium text-brand-300 underline decoration-brand-300/40 underline-offset-2 transition hover:text-brand-200 disabled:opacity-60"
                  >
                    {slipBusyId === c.id ? "กำลังเปิด…" : "ดูสลิป"}
                  </button>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
                  <p className="text-white/80">
                    <span className="text-white/45">ธนาคาร: </span>
                    {c.bankName}
                  </p>
                  <p className="text-white/80">
                    <span className="text-white/45">เลขบัญชี: </span>
                    {c.bankAccountNo}
                  </p>
                  <p className="text-white/80">
                    <span className="text-white/45">ชื่อบัญชี: </span>
                    {c.bankAccountName}
                  </p>
                </div>
              )}

              {/* actions / resolved state */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-white/45">สถานะคำขอ</span>
                {c.status === "pending" ? (
                  <span className="flex w-full items-center gap-2 sm:w-auto">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1 sm:flex-initial"
                      onClick={() => setRejectTarget(c)}
                    >
                      ปฏิเสธ
                    </Button>
                    {c.direction === "upgrade" ? (
                      <Button
                        size="sm"
                        className="flex-1 sm:flex-initial"
                        onClick={() => setApproveTarget(c)}
                      >
                        ตรวจสลิป + อนุมัติ
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="flex-1 sm:flex-initial"
                        onClick={() => setRefundTarget(c)}
                      >
                        ยืนยันคืนเงิน
                      </Button>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-2.5">
                    {c.status === "refunded" && c.refundSlipUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          viewSlip(c, c.refundSlipUrl, "สลิปคืนเงิน")
                        }
                        disabled={slipBusyId === c.id}
                        className="text-sm font-medium text-brand-300 underline decoration-brand-300/40 underline-offset-2 transition hover:text-brand-200 disabled:opacity-60"
                      >
                        {slipBusyId === c.id ? "กำลังเปิด…" : "ดูสลิปคืนเงิน"}
                      </button>
                    )}
                    <Pill
                      tone={
                        c.status === "rejected"
                          ? "bad"
                          : c.status === "refunded"
                            ? "good"
                            : "good"
                      }
                    >
                      {DIVISION_CHANGE_STATUS_LABEL[c.status]}
                      {c.status === "refunded" ? " · ล็อกแล้ว" : ""}
                    </Pill>
                  </span>
                )}
              </div>
              {c.status === "rejected" && c.adminNote && (
                <p className="mt-1.5 text-xs text-rose-300/90">
                  เหตุผล: {c.adminNote}
                </p>
              )}
              {c.resolvedAt && (
                <p className="mt-1.5 text-[11px] text-white/35">
                  อัปเดตเมื่อ {formatThaiDateTime(c.resolvedAt)}
                  {c.resolvedBy ? ` · โดย ${c.resolvedBy}` : ""}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <ApproveUpgradeSheet
        open={!!approveTarget}
        change={approveTarget}
        onClose={() => setApproveTarget(null)}
        onError={onResolveError}
      />

      <DivisionRefundSheet
        open={!!refundTarget}
        change={refundTarget}
        onClose={() => setRefundTarget(null)}
        onError={onResolveError}
      />

      <RejectSheet
        open={!!rejectTarget}
        change={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onError={onResolveError}
      />

      {/* slip viewer (signed URL on Supabase, data URL on mock) */}
      <Sheet
        open={!!slipView}
        onClose={() => setSlipView(null)}
        title={slipView?.name ?? "สลิป"}
      >
        {slipView && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slipView.url}
            alt="slip"
            className="w-full rounded-2xl object-contain ring-1 ring-white/10"
          />
        )}
      </Sheet>
    </>
  );
}

/** Approve an upgrade: shows the player's difference-payment slip inline so the
 *  admin verifies the transfer before the seat moves + the batch total rises. */
function ApproveUpgradeSheet({
  open,
  change,
  onClose,
  onError,
}: {
  open: boolean;
  change: DivisionChange | null;
  onClose: () => void;
  onError: (res: ResolveFailure) => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [slipLoading, setSlipLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !change) return;
    setSubmitting(false);
    setSlipUrl(null);
    if (!change.paymentSlipUrl) return;
    let active = true;
    setSlipLoading(true);
    dl.getRefundSlipUrl(change.paymentSlipUrl)
      .then((url) => {
        if (active) setSlipUrl(url);
      })
      .catch(() => {
        if (active) setSlipUrl(null);
      })
      .finally(() => {
        if (active) setSlipLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, change, dl]);

  async function onConfirm() {
    if (!change) return;
    setSubmitting(true);
    try {
      const res = await dl.adminResolveDivisionChange(change.id, "approve");
      if (res.ok) {
        toast.show("อนุมัติแล้ว — ย้ายรุ่นและปรับยอดใบสมัครเรียบร้อย", "success");
        onClose();
        return;
      }
      onError(res);
      onClose();
    } catch {
      toast.show("ดำเนินการไม่สำเร็จ กรุณาลองใหม่", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ตรวจสลิป + อนุมัติเปลี่ยนรุ่น"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button fullWidth onClick={onConfirm} loading={submitting}>
            อนุมัติ + ย้ายรุ่น
          </Button>
        </div>
      }
    >
      {change && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="font-semibold text-white/90">{change.personName}</p>
            <p className="mt-0.5 text-sm text-brand-300">
              {change.fromCategoryLabel} → {change.toCategoryLabel}
            </p>
            <p className="mt-0.5 text-xs text-white/45">
              ยอดส่วนต่างที่ต้องได้รับ {formatThb(change.amountThb)} ฿ ·{" "}
              {change.batchReference}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-white/80">
              สลิปโอนส่วนต่างจากผู้สมัคร
            </p>
            {slipLoading ? (
              <CenterLoader />
            ) : slipUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={slipUrl}
                alt="payment slip"
                className="w-full rounded-2xl object-contain ring-1 ring-white/10"
              />
            ) : (
              <p className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                เปิดสลิปไม่สำเร็จ — ตรวจสอบจากหน้ารายการก่อนอนุมัติ
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/55">
            เมื่ออนุมัติ ผู้เข้าแข่งขันจะถูกย้ายไป {change.toCategoryLabel}{" "}
            และยอดใบสมัครจะเพิ่มขึ้น {formatThb(change.amountThb)} ฿
            (ระบบตรวจสิทธิ์/ที่ว่างซ้ำอีกครั้งตอนอนุมัติ)
          </div>
        </div>
      )}
    </Sheet>
  );
}

/** Reject with an optional reason — the reason is shown to the player on
 *  /my-registrations. Nothing moves on a reject. */
function RejectSheet({
  open,
  change,
  onClose,
  onError,
}: {
  open: boolean;
  change: DivisionChange | null;
  onClose: () => void;
  onError: (res: ResolveFailure) => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setNote("");
      setSubmitting(false);
    }
  }, [open, change?.id]);

  async function onConfirm() {
    if (!change) return;
    setSubmitting(true);
    try {
      const res = await dl.adminResolveDivisionChange(change.id, "reject", {
        note: note.trim() || null,
      });
      if (res.ok) {
        toast.show("ปฏิเสธคำขอแล้ว", "success");
        onClose();
        return;
      }
      onError(res);
      onClose();
    } catch {
      toast.show("ดำเนินการไม่สำเร็จ กรุณาลองใหม่", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ปฏิเสธคำขอเปลี่ยนรุ่น"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={onConfirm}
            loading={submitting}
          >
            ยืนยันปฏิเสธ
          </Button>
        </div>
      }
    >
      {change && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="font-semibold text-white/90">{change.personName}</p>
            <p className="mt-0.5 text-sm text-brand-300">
              {change.fromCategoryLabel} → {change.toCategoryLabel}
            </p>
            <p className="mt-0.5 text-xs text-white/45">
              {change.direction === "upgrade" ? "จ่ายเพิ่ม" : "คืนเงิน"}{" "}
              {formatThb(change.amountThb)} ฿ · {change.batchReference}
            </p>
          </div>

          {change.direction === "upgrade" && (
            <div className={cn(
              "rounded-2xl border border-amber-400/25 bg-amber-500/10 p-3",
              "text-sm leading-relaxed text-amber-200/90",
            )}>
              หากผู้สมัครโอนส่วนต่างมาแล้ว อย่าลืมโอนคืนนอกระบบ
              และระบุในเหตุผลด้านล่างเพื่อให้ตรวจสอบย้อนหลังได้
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-semibold text-white/80">
              เหตุผล (แสดงให้ผู้สมัครเห็น)
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น สลิปไม่ถูกต้อง / รุ่นเต็มแล้ว / โอนคืนแล้ววันที่…"
              maxLength={500}
            />
          </div>
        </div>
      )}
    </Sheet>
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
