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
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { formatThb } from "@/lib/utils";
import {
  ActionBarSpacer,
  StickyActionBar,
} from "@/components/ui/StickyActionBar";

export default function PaymentStep() {
  const router = useRouter();
  const dl = useDataLayer();
  const toast = useToast();
  const { draft, setSlip, complete } = useRegisterFlow();
  const reservation = draft.reservation;

  const [payload, setPayload] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set once the registration is accepted server-side → opens the confirmation
  // popup. Until the user acknowledges it we keep the reservation in the draft
  // so the page doesn't bounce back to /register.
  const [confirmedRef, setConfirmedRef] = useState<string | null>(null);

  // Guard: must have an active reservation.
  useEffect(() => {
    if (!reservation) router.replace("/register");
  }, [reservation, router]);

  const { data: batch } = useLiveQuery(
    (d) => (reservation ? d.getBatch(reservation.batchId) : Promise.resolve(null)),
    [reservation?.batchId],
  );

  // Build the PromptPay payload once we know the amount + tournament target.
  useEffect(() => {
    if (!reservation) return;
    let active = true;
    dl.buildPromptPayPayload(reservation.tournamentId, reservation.totalAmountThb)
      .then((p) => {
        if (active) setPayload(p);
      })
      .catch(() => {
        if (active) setPayload(null);
      });
    return () => {
      active = false;
    };
  }, [dl, reservation]);

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

  async function onSubmit() {
    if (!reservation) return;
    if (!draft.slipDataUrl) {
      toast.show("กรุณาอัปโหลดสลิปการโอนเงิน", "error");
      return;
    }
    setSubmitting(true);
    try {
      const result = await dl.submitRegistration({
        batchId: reservation.batchId,
        slipUrl: draft.slipDataUrl,
      });
      // Open the confirmation popup; finalize on acknowledge (finishToSuccess).
      setConfirmedRef(result.referenceCode);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "HOLD_EXPIRED") {
        toast.show("หมดเวลาการจองที่นั่งแล้ว", "error");
        router.replace("/register/expired");
      } else if (msg === "STORAGE_FULL") {
        toast.show("ไฟล์สลิปใหญ่เกินไป กรุณาใช้รูปที่เล็กลง", "error");
      } else {
        toast.show("ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่", "error");
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-white/45">
              ยอดเงินที่ต้องชำระ
              {seatCount > 0 ? ` (${seatCount} คน)` : ""}
            </p>
            <p className="text-3xl font-bold text-white">
              {formatThb(reservation.totalAmountThb)} บาท
            </p>
          </div>
          <span className="rounded-lg bg-white/10 px-2 py-1 text-xs font-medium text-white/60 ring-1 ring-inset ring-white/10">
            {reservation.referenceCode}
          </span>
        </div>
      </Card>

      {/* QR */}
      <Card className="mb-4 p-5">
        {payload ? (
          <PromptPayQR payload={payload} amount={reservation.totalAmountThb} />
        ) : (
          <CenterLoader label="กำลังสร้าง QR…" />
        )}
      </Card>

      {/* Slip */}
      <Card className="mb-4 p-4">
        <h3 className="mb-3 text-base font-bold text-white">
          อัปโหลดสลิปการโอนเงิน
        </h3>
        <SlipUploader value={draft.slipDataUrl} onChange={setSlip} />
      </Card>

      <button
        type="button"
        onClick={() => router.push("/register/categories")}
        className="mb-2 text-sm font-medium text-white/50 transition hover:text-white/80"
      >
        ← แก้ไขข้อมูล/รุ่น
      </button>

      <ActionBarSpacer />
      <StickyActionBar>
        <Button
          fullWidth
          variant="success"
          onClick={onSubmit}
          loading={submitting}
          disabled={!draft.slipDataUrl}
        >
          ยืนยันการสมัคร
        </Button>
      </StickyActionBar>

      <Sheet
        open={!!confirmedRef}
        onClose={finishToSuccess}
        footer={
          <Button fullWidth variant="success" onClick={finishToSuccess}>
            เข้าใจแล้ว
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
              ทีมงานได้รับใบสมัครของคุณแล้ว
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-white/55">
              เจ้าหน้าที่จะตรวจสอบข้อมูลและการชำระเงิน
              โดยใช้เวลาประมาณ <span className="font-semibold text-white/80">3 วันทำการ</span>{" "}
              จากนั้นสถานะของคุณจะเปลี่ยนเป็น “ยืนยันแล้ว”
            </p>
          </div>
          {confirmedRef && (
            <div className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs text-white/45">หมายเลขอ้างอิง</p>
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
