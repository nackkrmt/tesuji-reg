"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRegisterFlow } from "@/components/register/RegisterFlowProvider";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { CountdownTimer } from "@/components/register/CountdownTimer";
import { PromptPayQR } from "@/components/register/PromptPayQR";
import { SlipUploader } from "@/components/register/SlipUploader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { TextInput } from "@/components/ui/form";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { formatThb } from "@/lib/utils";
import {
  ActionBarSpacer,
  StickyActionBar,
} from "@/components/ui/StickyActionBar";
import { isTransientError } from "@/lib/retry";
import { useI18n, type Dictionary } from "@/lib/i18n";

function promoError(t: Dictionary, code: string): string {
  switch (code) {
    case "PROMO_INVALID":
      return t.register.promoInvalid;
    case "PROMO_INACTIVE":
      return t.register.promoInactive;
    case "PROMO_NOT_STARTED":
      return t.register.promoNotStarted;
    case "PROMO_EXPIRED":
      return t.register.promoExpired;
    case "PROMO_EXHAUSTED":
      return t.register.promoExhausted;
    case "NOT_PENDING_PAYMENT":
      return t.register.promoNotPending;
    case "FORBIDDEN":
      return t.register.promoForbidden;
    default:
      return t.register.promoDefault;
  }
}

export default function PaymentStep() {
  const router = useRouter();
  const dl = useDataLayer();
  const toast = useToast();
  const { t } = useI18n();
  const { draft, setReservation, setSlip, complete } = useRegisterFlow();
  const reservation = draft.reservation;

  // "Resume payment" entry point: /register/payment?batch=<id> from My
  // Registrations. Read once on mount (client-only) so the guard below doesn't
  // bounce us to /register before the reservation is rebuilt from the server.
  const [resumeBatchId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("batch"),
  );

  const [payload, setPayload] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  // Set once the registration is accepted server-side → opens the confirmation
  // popup. Until the user acknowledges it we keep the reservation in the draft
  // so the page doesn't bounce back to /register.
  const [confirmedRef, setConfirmedRef] = useState<string | null>(null);

  // Guard: must have an active reservation — unless we're resuming a pending
  // batch (?batch=…), which rebuilds it in the effect just below.
  useEffect(() => {
    if (!reservation && !resumeBatchId) router.replace("/register");
  }, [reservation, resumeBatchId, router]);

  // Resume payment: the QR/slip screen normally runs off the in-memory draft,
  // which is gone once the tab/app is closed or opened on another device.
  // Arriving with ?batch=<id> rebuilds the reservation from the server batch so
  // the QR can be shown and paid again. get_batch_public is owner-scoped, and a
  // batch that is no longer pending_payment (paid/expired/cancelled) bails out.
  useEffect(() => {
    if (!resumeBatchId || reservation?.batchId === resumeBatchId) return;
    let active = true;
    dl.getBatch(resumeBatchId)
      .then((b) => {
        if (!active) return;
        if (!b || b.batch.status !== "pending_payment" || !b.hold) {
          router.replace("/register/expired");
          return;
        }
        setReservation({
          batchId: b.batch.id,
          holdId: b.batch.holdId ?? b.hold.id,
          expiresAt: b.hold.expiresAt,
          totalAmountThb: b.batch.totalAmountThb,
          referenceCode: b.batch.referenceCode,
          tournamentId: b.batch.tournamentId,
        });
      })
      .catch(() => {
        if (active) router.replace("/register/expired");
      });
    return () => {
      active = false;
    };
  }, [resumeBatchId, reservation?.batchId, dl, router, setReservation]);

  const { data: batch } = useLiveQuery(
    (d) => (reservation ? d.getBatch(reservation.batchId) : Promise.resolve(null)),
    [reservation?.batchId],
  );

  // The batch is the source of truth for the amount (a promo may have changed it).
  const total = batch?.batch.totalAmountThb ?? reservation?.totalAmountThb ?? 0;
  const discount = batch?.batch.discountThb ?? 0;
  const gross = total + discount;
  const appliedCode = batch?.batch.promoCode ?? null;
  const isFree = total <= 0;

  // Build the PromptPay payload from the current (possibly discounted) amount.
  useEffect(() => {
    if (!reservation || isFree) {
      setPayload(null);
      return;
    }
    let active = true;
    dl.buildPromptPayPayload(reservation.tournamentId, total)
      .then((p) => {
        if (active) setPayload(p);
      })
      .catch(() => {
        if (active) setPayload(null);
      });
    return () => {
      active = false;
    };
  }, [dl, reservation, total, isFree]);

  const onExpire = useCallback(() => {
    // Already submitted + accepted → the hold is consumed; ignore the visual timer.
    if (confirmedRef) return;
    router.replace("/register/expired");
  }, [router, confirmedRef]);

  // Acknowledge the confirmation popup → finalize the flow + land on the success
  // page (keeps the reference code for the registrant's records).
  function finishToSuccess() {
    if (!confirmedRef) return;
    complete(confirmedRef);
    router.replace("/register/success");
  }

  // If the batch was swept to expired/cancelled out from under us, bail out.
  useEffect(() => {
    if (batch && batch.batch.status !== "pending_payment") {
      if (
        batch.batch.status === "expired" ||
        batch.batch.status === "cancelled"
      ) {
        router.replace("/register/expired");
      }
    }
  }, [batch, router]);

  if (!reservation) return <CenterLoader />;

  async function applyCode(code: string | null) {
    if (!reservation) return;
    setPromoBusy(true);
    try {
      const res = await dl.applyPromo(reservation.batchId, code);
      if (!res.ok) {
        toast.show(promoError(t, res.error), "error");
        return;
      }
      if (code) {
        toast.show(
          res.isFree
            ? t.register.promoFree
            : t.register.promoDiscountToast(formatThb(res.discountThb)),
          "success",
        );
        setCodeInput("");
      } else {
        toast.show(t.register.promoRemoved, "info");
      }
    } catch {
      toast.show(t.register.promoFailed, "error");
    } finally {
      setPromoBusy(false);
    }
  }

  async function onSubmit() {
    if (!reservation) return;
    if (!isFree && !draft.slipDataUrl) {
      toast.show(t.register.uploadSlipFirst, "error");
      return;
    }
    setSubmitting(true);
    try {
      const result = await dl.submitRegistration({
        batchId: reservation.batchId,
        slipUrl: isFree ? "" : draft.slipDataUrl ?? "",
      });
      // Open the confirmation popup; finalize on acknowledge (finishToSuccess).
      setConfirmedRef(result.referenceCode);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "HOLD_EXPIRED") {
        toast.show(t.register.holdExpired, "error");
        router.replace("/register/expired");
      } else if (msg === "PROMO_EXHAUSTED") {
        toast.show(t.register.promoJustExhausted, "error");
      } else if (
        msg === "PROMO_EXPIRED" ||
        msg === "PROMO_INVALID" ||
        msg === "PROMO_NOT_STARTED"
      ) {
        toast.show(t.register.promoNoLongerValid, "error");
      } else if (msg === "STORAGE_FULL") {
        toast.show(t.register.slipTooLarge, "error");
      } else if (isTransientError(e)) {
        toast.show(t.register.busyRetrySubmit, "error");
      } else {
        toast.show(t.register.submitFailed, "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const seatCount = batch?.seats.length ?? 0;

  return (
    <div className="mx-auto max-w-app px-4 py-4">
      <div className="mb-4">
        <CountdownTimer expiresAt={reservation.expiresAt} onExpire={onExpire} />
      </div>

      {/* Amount summary */}
      <Card className="mb-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-white/45">
              {t.register.amountDue}
              {seatCount > 0 ? t.register.itemsCount(seatCount) : ""}
            </p>
            <p className="text-3xl font-bold text-white">
              {t.register.amountBaht(formatThb(total))}
            </p>
            {discount > 0 && (
              <p className="mt-1 text-sm">
                <span className="text-white/40 line-through">
                  {t.register.amountBaht(formatThb(gross))}
                </span>{" "}
                <span className="font-medium text-emerald-300">
                  {t.register.discountLabel(formatThb(discount), appliedCode)}
                </span>
              </p>
            )}
          </div>
          <span className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-xs font-medium text-white/60 ring-1 ring-inset ring-white/10">
            {reservation.referenceCode}
          </span>
        </div>
      </Card>

      {/* Promo code */}
      <Card className="mb-4 p-4">
        <h3 className="mb-2.5 text-sm font-bold text-white/90">
          {t.register.promoHeading}
        </h3>
        {appliedCode ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold tracking-wide text-emerald-200">
                {appliedCode}
              </p>
              <p className="text-xs text-emerald-300/80">
                {isFree ? t.register.free : t.register.discountAmount(formatThb(discount))}
                {t.register.usedSuffix}
              </p>
            </div>
            <button
              type="button"
              onClick={() => applyCode(null)}
              disabled={promoBusy}
              className="shrink-0 text-sm font-medium text-white/55 transition hover:text-white/90 disabled:opacity-40"
            >
              {t.register.removeCode}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <TextInput
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder={t.register.enterCode}
              className="font-mono tracking-wide"
              onKeyDown={(e) => {
                if (e.key === "Enter" && codeInput.trim()) applyCode(codeInput.trim());
              }}
            />
            <Button
              variant="secondary"
              className="shrink-0 px-5"
              loading={promoBusy}
              disabled={!codeInput.trim()}
              onClick={() => applyCode(codeInput.trim())}
            >
              {t.register.applyCode}
            </Button>
          </div>
        )}
      </Card>

      {isFree ? (
        /* Free — no payment needed */
        <Card className="mb-4 border border-emerald-400/30 bg-emerald-500/[0.07] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-inset ring-emerald-400/30">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-emerald-100">{t.register.freeNoPayment}</p>
              <p className="text-sm text-emerald-300/80">
                {t.register.freeConfirmHint}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* QR */}
          <Card className="mb-4 p-5">
            {payload ? (
              <PromptPayQR payload={payload} amount={total} />
            ) : (
              <CenterLoader label={t.register.buildingQr} />
            )}
          </Card>

          {/* Slip */}
          <Card className="mb-4 p-4">
            <h3 className="mb-3 text-base font-bold text-white">
              {t.register.uploadSlipHeading}
            </h3>
            <SlipUploader value={draft.slipDataUrl} onChange={setSlip} />
          </Card>
        </>
      )}

      {/* Editing the seats only makes sense mid-flow; on a resumed batch the
          draft has no participants, so hide it rather than dead-end at Step A. */}
      {draft.participants.length > 0 && (
        <button
          type="button"
          onClick={() => router.push("/register/categories")}
          className="mb-2 text-sm font-medium text-white/50 transition hover:text-white/80"
        >
          {t.register.editData}
        </button>
      )}

      <ActionBarSpacer />
      <StickyActionBar>
        <Button
          fullWidth
          variant="success"
          onClick={onSubmit}
          loading={submitting}
          disabled={!isFree && !draft.slipDataUrl}
        >
          {isFree ? t.register.confirmFree : t.register.confirm}
        </Button>
      </StickyActionBar>

      <Sheet
        open={!!confirmedRef}
        onClose={finishToSuccess}
        footer={
          <Button fullWidth variant="success" onClick={finishToSuccess}>
            {t.register.understood}
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-inset ring-emerald-400/30">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {isFree ? t.register.successFree : t.register.received}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-white/55">
              {isFree ? (
                t.register.successFreeDesc
              ) : (
                <>
                  {t.register.reviewDescLead}
                  <span className="font-semibold text-white/80">
                    {t.register.reviewDays}
                  </span>
                  {t.register.reviewDescTail}
                </>
              )}
            </p>
          </div>
          {confirmedRef && (
            <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs text-white/45">{t.register.referenceNo}</p>
              <p className="text-lg font-bold tracking-wide text-brand-200">
                {confirmedRef}
              </p>
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
}
