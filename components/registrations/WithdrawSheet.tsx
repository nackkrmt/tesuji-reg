"use client";

import { useEffect, useState } from "react";
import { Category, RegistrationSeat } from "@/lib/data/types";
import { useDataLayer } from "@/lib/data/store";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, TextInput, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { formatThb, fullNameTh } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Withdraw one seat from the competition. Collects the refund destination +
 *  reason and shows the discretionary-refund disclaimer. On success the seat is
 *  marked withdrawn (name off the roster, seat back to capacity); the batch total
 *  is untouched. */
export function WithdrawSheet({
  open,
  onClose,
  seat,
  category,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  seat: RegistrationSeat;
  category: Category | undefined;
  onDone: () => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const { t } = useI18n();

  const [bankName, setBankName] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // reset the form each time it opens for a (possibly different) seat
  useEffect(() => {
    if (open) {
      setBankName("");
      setBankAccountNo("");
      setBankAccountName("");
      setReason("");
      setSubmitting(false);
    }
  }, [open, seat.id]);

  async function onConfirm() {
    if (!bankName.trim() || !bankAccountNo.trim() || !bankAccountName.trim()) {
      toast.show(t.withdraw.errRequired, "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await dl.withdrawSeat({
        seatId: seat.id,
        reason: reason.trim() || null,
        bankName: bankName.trim(),
        bankAccountNo: bankAccountNo.trim(),
        bankAccountName: bankAccountName.trim(),
      });
      if (res.ok) {
        toast.show(t.withdraw.success, "success");
        onDone();
        onClose();
        return;
      }
      switch (res.error) {
        case "INVALID_FIELD":
          toast.show(t.withdraw.errAccountNo, "error");
          break;
        case "ALREADY_WITHDRAWN":
          toast.show(t.withdraw.errAlready, "error");
          break;
        default:
          toast.show(t.withdraw.errGeneric, "error");
      }
    } catch {
      toast.show(t.withdraw.errGeneric, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t.withdraw.title}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {t.withdraw.cancel}
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={onConfirm}
            loading={submitting}
          >
            {t.withdraw.confirm}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* who / which division / fee */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <p className="font-semibold text-white/90">{fullNameTh(seat)}</p>
          <p className="mt-0.5 text-sm text-brand-300">
            {category ? `${category.code} · ${category.name}` : t.person.dash}
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            {t.withdraw.seatFee(formatThb(seat.feeThbSnapshot))}
          </p>
        </div>

        {/* discretionary-refund disclaimer */}
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-3">
          <p className="text-sm font-semibold text-amber-200">
            {t.withdraw.warningTitle}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-200/90">
            {t.withdraw.warningBody}
          </p>
        </div>

        {/* refund bank info */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-white/80">
            {t.withdraw.bankInfoHeading}
          </p>
          <Field label={t.withdraw.bankName} htmlFor="wd-bank" required>
            <TextInput
              id="wd-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder={t.withdraw.bankNamePlaceholder}
              maxLength={100}
            />
          </Field>
          <Field label={t.withdraw.accountNo} htmlFor="wd-acctno" required>
            <TextInput
              id="wd-acctno"
              inputMode="numeric"
              value={bankAccountNo}
              onChange={(e) => setBankAccountNo(e.target.value)}
              placeholder={t.withdraw.accountNoPlaceholder}
              maxLength={30}
            />
          </Field>
          <Field label={t.withdraw.accountName} htmlFor="wd-acctname" required>
            <TextInput
              id="wd-acctname"
              value={bankAccountName}
              onChange={(e) => setBankAccountName(e.target.value)}
              placeholder={t.withdraw.accountNamePlaceholder}
              maxLength={100}
            />
          </Field>
        </div>

        {/* reason (optional) */}
        <Field label={t.withdraw.reasonLabel} htmlFor="wd-reason">
          <Textarea
            id="wd-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.withdraw.reasonPlaceholder}
            maxLength={1000}
          />
        </Field>
      </div>
    </Sheet>
  );
}
