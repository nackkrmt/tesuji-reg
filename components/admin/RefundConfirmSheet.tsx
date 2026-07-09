"use client";

import { useEffect, useState } from "react";
import { Withdrawal } from "@/lib/data/types";
import { useDataLayer } from "@/lib/data/store";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { SlipUploader } from "@/components/register/SlipUploader";
import { useToast } from "@/components/ui/Toast";
import { formatThb } from "@/lib/utils";

/** Admin confirms a refund: shows the transfer destination, requires the
 *  bank-transfer slip as proof, and warns that "refunded" locks permanently.
 *  On confirm the data layer uploads the slip and the RPC enforces the same
 *  rules server-side (SLIP_REQUIRED / LOCKED). */
export function RefundConfirmSheet({
  open,
  onClose,
  withdrawal,
}: {
  open: boolean;
  onClose: () => void;
  withdrawal: Withdrawal | null;
}) {
  const dl = useDataLayer();
  const toast = useToast();

  const [slip, setSlip] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // reset each time it opens for a (possibly different) withdrawal
  useEffect(() => {
    if (open) {
      setSlip(null);
      setSubmitting(false);
    }
  }, [open, withdrawal?.id]);

  async function onConfirm() {
    if (!withdrawal || !slip) return;
    setSubmitting(true);
    try {
      await dl.adminSetWithdrawalStatus(withdrawal.id, "refunded", slip);
      toast.show("บันทึกการคืนเงินแล้ว", "success");
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "LOCKED") {
        toast.show("รายการนี้คืนเงินแล้ว ไม่สามารถเปลี่ยนสถานะได้", "error");
        onClose();
      } else if (msg === "SLIP_REQUIRED") {
        toast.show("กรุณาแนบสลิปหลักฐานการคืนเงิน", "error");
      } else {
        toast.show("อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่", "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="ยืนยันการคืนเงิน"
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
      {withdrawal && (
        <div className="space-y-4">
          {/* who / which division / amount */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <p className="font-semibold text-white/90">
              {withdrawal.personName}
            </p>
            <p className="mt-0.5 text-sm text-brand-300">
              {withdrawal.categoryLabel}
            </p>
            <p className="mt-0.5 text-xs text-white/45">
              ยอดคืน {formatThb(withdrawal.feeThb)} ฿ ·{" "}
              {withdrawal.batchReference}
            </p>
          </div>

          {/* transfer destination the admin should have paid to */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm">
            <p className="text-white/80">
              <span className="text-white/45">ธนาคาร: </span>
              {withdrawal.bankName}
            </p>
            <p className="text-white/80">
              <span className="text-white/45">เลขบัญชี: </span>
              {withdrawal.bankAccountNo}
            </p>
            <p className="text-white/80">
              <span className="text-white/45">ชื่อบัญชี: </span>
              {withdrawal.bankAccountName}
            </p>
          </div>

          {/* permanent-lock warning */}
          <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-3">
            <p className="text-sm font-semibold text-amber-200">
              สถานะจะถูกล็อกถาวร
            </p>
            <p className="mt-1 text-sm leading-relaxed text-amber-200/90">
              เมื่อยืนยัน &ldquo;คืนเงินแล้ว&rdquo;
              จะไม่สามารถแก้ไขสถานะรายการนี้ได้อีก
              กรุณาตรวจสอบว่าโอนเงินเรียบร้อยแล้วก่อนยืนยัน
            </p>
          </div>

          {/* proof of transfer (required) */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-white/80">
              สลิปหลักฐานการโอนเงินคืน{" "}
              <span className="text-rose-300">*</span>
            </p>
            <SlipUploader value={slip} onChange={setSlip} />
          </div>
        </div>
      )}
    </Sheet>
  );
}
