"use client";

import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { formatThb } from "@/lib/utils";

export function PromptPayQR({
  payload,
  amount,
}: {
  payload: string;
  amount: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function download() {
    const canvas = ref.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `promptpay-${amount}.png`;
    a.click();
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" ref={ref}>
        <div className="mb-2 flex items-center justify-center gap-1.5">
          <span className="text-sm font-bold text-[#1d3a8a]">PromptPay</span>
        </div>
        <QRCodeCanvas value={payload} size={208} level="M" includeMargin />
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-slate-900">
          {formatThb(amount)} บาท
        </p>
        <p className="text-sm text-slate-400">
          สแกนด้วยแอปธนาคารเพื่อชำระเงิน (จำนวนเงินถูกล็อกไว้)
        </p>
      </div>
      <button
        type="button"
        onClick={download}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        บันทึก QR
      </button>
    </div>
  );
}
