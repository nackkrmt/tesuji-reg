"use client";

import { useState } from "react";
import { fileToDownscaledDataUrl, MAX_UPLOAD_BYTES } from "@/lib/image";
import { useToast } from "@/components/ui/Toast";

const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic"];

export function SlipUploader({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.show("ไฟล์ใหญ่เกินไป (สูงสุด 8MB)", "error");
      return;
    }
    if (file.type && !ALLOWED.includes(file.type)) {
      toast.show("รองรับเฉพาะไฟล์รูปภาพ", "error");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file, 1400, 0.82);
      onChange(dataUrl);
    } catch {
      toast.show("อ่านไฟล์ไม่สำเร็จ", "error");
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
          className="max-h-72 w-full rounded-xl object-contain ring-1 ring-slate-200"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-sm font-medium text-rose-600"
        >
          เปลี่ยน/ลบสลิป
        </button>
      </div>
    );
  }

  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-brand-400 hover:bg-brand-50">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      </svg>
      <span className="text-sm font-medium text-slate-600">
        {busy ? "กำลังประมวลผล…" : "แตะเพื่ออัปโหลดสลิปการโอนเงิน"}
      </span>
      <span className="text-xs text-slate-400">PNG, JPG (สูงสุด 8MB)</span>
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
