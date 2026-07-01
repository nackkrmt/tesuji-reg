"use client";

import { useState } from "react";
import { fileToDownscaledDataUrl, MAX_UPLOAD_BYTES } from "@/lib/image";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n";

const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic"];

export function SlipUploader({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const toast = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.show(t.register.slipTooBig, "error");
      return;
    }
    if (file.type && !ALLOWED.includes(file.type)) {
      toast.show(t.register.imagesOnly, "error");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file, 1400, 0.82);
      onChange(dataUrl);
    } catch {
      toast.show(t.register.readFailed, "error");
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt="payment slip"
          className="max-h-72 w-full rounded-2xl object-contain ring-1 ring-white/10"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-sm font-medium text-rose-300 transition hover:text-rose-200"
        >
          {t.register.changeSlip}
        </button>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 bg-white/[0.03] px-4 py-8 text-center transition hover:border-brand-400/50 hover:bg-brand-500/10">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      </svg>
      <span className="text-sm font-medium text-white/70">
        {busy ? t.register.processing : t.register.tapToUpload}
      </span>
      <span className="text-xs text-white/40">{t.register.fileHint}</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
        }}
      />
    </label>
  );
}
