"use client";

import { useEffect, useState } from "react";
import { RegistrationBatch } from "@/lib/data/types";
import { useDataLayer } from "@/lib/data/store";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { SlipUploader } from "@/components/register/SlipUploader";
import { useToast } from "@/components/ui/Toast";
import { formatThb } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Send a new payment slip for a REJECTED registration.
 *
 *  Until now a rejection was a dead end for the registrant: the seats went back
 *  to the pool, submit_registration refuses a hold that is not active, and the
 *  payment page had no way back in — so the usual cause (a blurry slip, or the
 *  wrong amount) could only be fixed by asking the organiser to reopen the
 *  batch by hand. resubmit_registration (20260915_0006) re-takes the seats and
 *  returns the batch to the review queue.
 *
 *  The seats are NOT held while the batch sits rejected, so the รุ่น can fill up
 *  in the meantime — hence INSUFFICIENT_SEATS, which names the division that is
 *  now full. */
export function ResubmitSheet({
  open,
  onClose,
  batch,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  batch: RegistrationBatch;
  onDone: () => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const { t } = useI18n();

  const [slip, setSlip] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fresh form each time it opens, for a possibly different batch.
  useEffect(() => {
    if (open) {
      setSlip(null);
      setSubmitting(false);
    }
  }, [open, batch.id]);

  const needsSlip = batch.totalAmountThb > 0;

  async function submit() {
    if (needsSlip && !slip) {
      toast.show(t.myReg.resubmitNeedsSlip, "error");
      return;
    }
    setSubmitting(true);
    try {
      await dl.resubmitRegistration({
        batchId: batch.id,
        slipUrl: slip ?? "",
      });
      toast.show(t.myReg.resubmitDone, "success");
      onDone();
      onClose();
    } catch (e) {
      // INSUFFICIENT_SEATS carries the division name after a colon.
      const raw = e instanceof Error ? e.message : "";
      const [code, detail] = raw.split(":");
      toast.show(t.myReg.resubmitError(code, detail ?? null), "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t.myReg.resubmitTitle}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-white/70">
          {t.myReg.resubmitIntro(batch.referenceCode)}
        </p>

        {batch.adminNote && (
          <div className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-inset ring-rose-400/25">
            {t.myReg.resubmitAdminNote(batch.adminNote)}
          </div>
        )}

        {needsSlip ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-white/80">
              {t.myReg.resubmitAmount(formatThb(batch.totalAmountThb))}
            </p>
            <SlipUploader value={slip} onChange={setSlip} />
          </div>
        ) : (
          <p className="text-sm text-white/60">{t.myReg.resubmitFree}</p>
        )}

        <Button
          className="w-full"
          onClick={submit}
          disabled={submitting || (needsSlip && !slip)}
        >
          {submitting ? t.common.saving : t.myReg.resubmitAction}
        </Button>
      </div>
    </Sheet>
  );
}
