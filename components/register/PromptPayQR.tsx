"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { formatThb } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function PromptPayQR({
  payload,
  amount,
  fallbackQr,
}: {
  payload: string;
  amount: number;
  /** The merchant's original untouched QR — offered as a backup when a bank
   *  app rejects the amount-injected payload (e.g. K PLUS). */
  fallbackQr?: string | null;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [showFallback, setShowFallback] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasFallback = !!fallbackQr && fallbackQr !== payload;
  const useFallback = showFallback && hasFallback;

  function download() {
    const canvas = ref.current?.querySelector("canvas");
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `promptpay-${amount}.png`;
    a.click();
  }

  async function copyAmount() {
    try {
      // Raw digits (no thousands separator) — ready to paste into the bank app.
      await navigator.clipboard.writeText(String(amount));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable in some webviews — the amount is displayed anyway */
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" ref={ref}>
        <div className="mb-2 flex items-center justify-center gap-1.5">
          <span className="text-sm font-bold text-[#1d3a8a]">PromptPay</span>
        </div>
        <QRCodeCanvas
          value={useFallback ? (fallbackQr as string) : payload}
          size={208}
          level="M"
          includeMargin
        />
      </div>
      <div className="text-center">
        <p className="text-2xl font-bold text-white">
          {t.register.amountBaht(formatThb(amount))}
        </p>
        <p className="text-sm text-white/45">
          {useFallback ? t.register.scanToPayManual : t.register.scanToPay}
        </p>
      </div>
      {useFallback && (
        <div className="w-full rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-center">
          <p className="text-sm leading-relaxed text-amber-200">
            {t.register.qrFallbackNote(formatThb(amount))}
          </p>
          <button
            type="button"
            onClick={copyAmount}
            className="mt-2 rounded-xl bg-amber-400/20 px-3 py-1.5 text-sm font-semibold text-amber-100 ring-1 ring-inset ring-amber-400/30 transition hover:bg-amber-400/30"
          >
            {copied ? t.register.copiedAmount : t.register.copyAmount}
          </button>
        </div>
      )}
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
      {hasFallback && (
        <button
          type="button"
          onClick={() => setShowFallback((v) => !v)}
          className="text-sm font-medium text-brand-300 underline-offset-2 transition hover:underline"
        >
          {useFallback ? t.register.qrFallbackHide : t.register.qrFallbackShow}
        </button>
      )}
    </div>
  );
}
