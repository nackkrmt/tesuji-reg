"use client";

import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { formatThb } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function PromptPayQR({
  payload,
  amount,
}: {
  payload: string;
  amount: number;
}) {
  const { t } = useI18n();
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
        <p className="text-2xl font-bold text-white">
          {t.register.amountBaht(formatThb(amount))}
        </p>
        <p className="text-sm text-white/45">
          {t.register.scanToPay}
        </p>
      </div>
      <button
        type="button"
        onClick={download}
        className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-medium text-white/80 ring-1 ring-inset ring-white/10 transition hover:bg-white/15"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
        </svg>
        {t.register.saveQr}
      </button>
    </div>
  );
}
