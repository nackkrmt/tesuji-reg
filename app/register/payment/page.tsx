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
    router.replace("/register/expired");
  }, [router]);

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
      complete(result.referenceCode);
      router.replace("/register/success");
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
            <p className="text-sm text-slate-400">
              ยอดเงินที่ต้องชำระ
              {seatCount > 0 ? ` (${seatCount} คน)` : ""}
            </p>
            <p className="text-3xl font-bold text-slate-900">
              {formatThb(reservation.totalAmountThb)} บาท
            </p>
          </div>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">
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
        <h3 className="mb-3 text-base font-bold text-slate-900">
          อัปโหลดสลิปการโอนเงิน
        </h3>
        <SlipUploader value={draft.slipDataUrl} onChange={setSlip} />
      </Card>

      <button
        type="button"
        onClick={() => router.push("/register/categories")}
        className="mb-2 text-sm font-medium text-slate-500"
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
    </div>
  );
}
