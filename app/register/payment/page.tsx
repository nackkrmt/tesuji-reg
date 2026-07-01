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

function promoError(code: string): string {
  switch (code) {
    case "PROMO_INVALID":
      return "ไม่พบโค้ดนี้ในรายการแข่งขัน";
    case "PROMO_INACTIVE":
      return "โค้ดนี้ถูกปิดใช้งาน";
    case "PROMO_NOT_STARTED":
      return "ยังไม่ถึงเวลาเริ่มใช้โค้ดนี้";
    case "PROMO_EXPIRED":
      return "โค้ดนี้หมดอายุแล้ว";
    case "PROMO_EXHAUSTED":
      return "โค้ดนี้ถูกใช้ครบจำนวนแล้ว";
    case "NOT_PENDING_PAYMENT":
      return "ใบสมัครนี้ใช้โค้ดไม่ได้แล้ว";
    case "FORBIDDEN":
      return "ใช้โค้ดกับใบสมัครนี้ไม่ได้";
    default:
      return "ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่";
  }
}

export default function PaymentStep() {
  const router = useRouter();
  const dl = useDataLayer();
  const toast = useToast();
  const { draft, setSlip, complete } = useRegisterFlow();
  const reservation = draft.reservation;

  const [payload, setPayload] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
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
        toast.show(promoError(res.error), "error");
        return;
      }
      if (code) {
        toast.show(
          res.isFree
            ? "ใช้โค้ดสำเร็จ — สมัครฟรี! 🎉"
            : `ใช้โค้ดแล้ว ลด ${formatThb(res.discountThb)} บาท`,
          "success",
        );
        setCodeInput("");
      } else {
        toast.show("นำโค้ดออกแล้ว", "info");
      }
    } catch {
      toast.show("ใช้โค้ดไม่สำเร็จ กรุณาลองใหม่", "error");
    } finally {
      setPromoBusy(false);
    }
  }

  async function onSubmit() {
    if (!reservation) return;
    if (!isFree && !draft.slipDataUrl) {
      toast.show("กรุณาอัปโหลดสลิปการโอนเงิน", "error");
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
      // Auto-run the SlipOK check in the background (paid only) so the admin sees
      // a result without clicking. Fire-and-forget — never affects the user view.
      if (!isFree) void dl.verifySlip(result.id).catch(() => {});
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "HOLD_EXPIRED") {
        toast.show("หมดเวลาการจองที่นั่งแล้ว", "error");
        router.replace("/register/expired");
      } else if (msg === "PROMO_EXHAUSTED") {
        toast.show("โค้ดนี้เพิ่งถูกใช้ครบจำนวนแล้ว", "error");
      } else if (
        msg === "PROMO_EXPIRED" ||
        msg === "PROMO_INVALID" ||
        msg === "PROMO_NOT_STARTED"
      ) {
        toast.show("โค้ดส่วนลดใช้ไม่ได้แล้ว กรุณาตรวจสอบอีกครั้ง", "error");
      } else if (msg === "STORAGE_FULL") {
        toast.show("ไฟล์สลิปใหญ่เกินไป กรุณาใช้รูปที่เล็กลง", "error");
      } else if (isTransientError(e)) {
        toast.show("ระบบกำลังหนาแน่น กรุณากด “ยืนยันการสมัคร” อีกครั้ง", "error");
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-white/45">
              ยอดเงินที่ต้องชำระ
              {seatCount > 0 ? ` (${seatCount} รายการ)` : ""}
            </p>
            <p className="text-3xl font-bold text-white">
              {formatThb(total)} บาท
            </p>
            {discount > 0 && (
              <p className="mt-1 text-sm">
                <span className="text-white/40 line-through">
                  {formatThb(gross)} บาท
                </span>{" "}
                <span className="font-medium text-emerald-300">
                  ส่วนลด −{formatThb(discount)}
                  {appliedCode ? ` (${appliedCode})` : ""}
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
          โค้ดส่วนลด / สมัครฟรี
        </h3>
        {appliedCode ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3.5 py-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-bold tracking-wide text-emerald-200">
                {appliedCode}
              </p>
              <p className="text-xs text-emerald-300/80">
                {isFree ? "สมัครฟรี" : `ลด ${formatThb(discount)} บาท`} — ใช้โค้ดแล้ว
              </p>
            </div>
            <button
              type="button"
              onClick={() => applyCode(null)}
              disabled={promoBusy}
              className="shrink-0 text-sm font-medium text-white/55 transition hover:text-white/90 disabled:opacity-40"
            >
              นำออก
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <TextInput
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="กรอกโค้ดที่นี่"
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
              ใช้โค้ด
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
              <p className="font-semibold text-emerald-100">สมัครฟรี — ไม่ต้องชำระเงิน</p>
              <p className="text-sm text-emerald-300/80">
                กด “ยืนยันการสมัคร” ด้านล่างได้เลย
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
        </>
      )}

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
          disabled={!isFree && !draft.slipDataUrl}
        >
          {isFree ? "ยืนยันการสมัคร (ฟรี)" : "ยืนยันการสมัคร"}
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
              {isFree
                ? "สมัครสำเร็จแล้ว!"
                : "ทีมงานได้รับใบสมัครของคุณแล้ว"}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-white/55">
              {isFree ? (
                <>
                  ใบสมัครของคุณได้รับการยืนยันเรียบร้อย
                  เก็บหมายเลขอ้างอิงไว้เป็นหลักฐาน
                </>
              ) : (
                <>
                  เจ้าหน้าที่จะตรวจสอบข้อมูลและการชำระเงิน
                  โดยใช้เวลาประมาณ{" "}
                  <span className="font-semibold text-white/80">3 วันทำการ</span>{" "}
                  จากนั้นสถานะของคุณจะเปลี่ยนเป็น “ยืนยันแล้ว”
                </>
              )}
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
