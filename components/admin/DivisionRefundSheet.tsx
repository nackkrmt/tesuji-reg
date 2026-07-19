"use client";

import { useEffect, useState } from "react";
import {
  AdminResolveDivisionChangeResult,
  DivisionChange,
} from "@/lib/data/types";
import { useDataLayer } from "@/lib/data/store";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { SlipUploader } from "@/components/register/SlipUploader";
import { useToast } from "@/components/ui/Toast";
import { formatThb } from "@/lib/utils";

/** Admin confirms a division-downgrade refund: shows the transfer destination,
 *  requires the bank-transfer slip as proof, and warns that confirming moves
 *  the seat AND locks the request permanently (mirrors RefundConfirmSheet;
 *  the RPC enforces SLIP_REQUIRED / LOCKED and re-validates the move). */
export function DivisionRefundSheet({
  open,
  onClose,
  change,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  change: DivisionChange | null;
  /** Business failures bubble up so the page can toast the specific reason
   *  (e.g. the target division filled up while the request was pending). */
  onError: (res: Exclude<AdminResolveDivisionChangeResult, { ok: true }>) => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();

  const [slip, setSlip] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // reset each time it opens for a (possibly different) request
  useEffect(() => {
    if (open) {
      setSlip(null);
      setSubmitting(false);
    }
  }, [open, change?.id]);

  async function onConfirm() {
    if (!change || !slip) return;
    setSubmitting(true);
    try {
      const res = await dl.adminResolveDivisionChange(change.id, "approve", {
        refundSlip: slip,
      });
      if (res.ok) {
        toast.show("บันทึกการคืนเงินและย้ายรุ่นแล้ว", "success");
        onClose();
        return;
      }
      onError(res);
      // the page toasts the specific reason; keep the sheet open only for
      // slip problems the admin can fix in place
      if (res.error !== "SLIP_REQUIRED") onClose();
    } catch {
      toast.show("อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ยืนยันคืนเงินส่วนต่าง + ย้ายรุ่น"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            ยกเลิก
          </Button>
          <Button
            fullWidth
            onClick={onConfirm}
            disabled={!slip}
            loading={submitting}
          >
            ยืนยันคืนเงินแล้ว
          </Button>
        </div>
      }
    >
      {change && (
        <div className="space-y-4">
          {/* who / from → to / amount */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="font-semibold text-white/90">{change.personName}</p>
            <p className="mt-0.5 text-sm text-brand-300">
              {change.fromCategoryLabel} → {change.toCategoryLabel}
            </p>
            <p className="mt-0.5 text-xs text-white/45">
              ยอดคืนส่วนต่าง {formatThb(change.amountThb)} ฿ ·{" "}
              {change.batchReference}
            </p>
          </div>

          {/* transfer destination the admin should have paid to */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
            <p className="text-white/80">
              <span className="text-white/45">ธนาคาร: </span>
              {change.bankName}
            </p>
            <p className="text-white/80">
              <span className="text-white/45">เลขบัญชี: </span>
              {change.bankAccountNo}
            </p>
            <p className="text-white/80">
              <span className="text-white/45">ชื่อบัญชี: </span>
              {change.bankAccountName}
            </p>
          </div>

          {/* permanent-lock + move warning */}
          <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-3">
            <p className="text-sm font-semibold text-amber-200">
              ยืนยันแล้วจะย้ายรุ่นทันทีและล็อกถาวร
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-200/90">
              เมื่อยืนยัน ผู้เข้าแข่งขันจะถูกย้ายไป {change.toCategoryLabel}{" "}
              ยอดใบสมัครจะถูกปรับลด และรายการนี้จะแก้ไขไม่ได้อีก
              กรุณาตรวจสอบว่าโอนเงินคืนเรียบร้อยแล้วก่อนยืนยัน
            </p>
          </div>

          {/* proof of transfer (required) */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white/80">
              สลิปหลักฐานการโอนเงินคืน <span className="text-rose-300">*</span>
            </p>
            <SlipUploader value={slip} onChange={setSlip} />
          </div>
        </div>
      )}
    </Sheet>
  );
}
