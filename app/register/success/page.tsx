"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SUCCESS_KEY } from "@/components/register/RegisterFlowProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function SuccessStep() {
  const [ref, setRef] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SUCCESS_KEY);
      if (raw) setRef(JSON.parse(raw).referenceCode ?? null);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="mx-auto max-w-app px-4 py-10">
      <Card className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">ส่งใบสมัครแล้ว!</h1>
          <p className="mt-1 text-sm text-slate-500">
            ระบบได้รับใบสมัครและสลิปของคุณแล้ว
            อยู่ระหว่างรอผู้จัดการแข่งขันตรวจสอบและยืนยัน
            โดยใช้เวลาประมาณ 3 วันทำการ
          </p>
        </div>

        {ref && (
          <div className="w-full rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-400">หมายเลขอ้างอิง</p>
            <p className="text-lg font-bold tracking-wide text-brand-800">
              {ref}
            </p>
          </div>
        )}

        <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-700">
          สถานะ: รอตรวจสอบ
        </span>

        <p className="text-xs text-slate-400">
          กรุณาบันทึกหมายเลขอ้างอิงไว้
          เพื่อใช้ติดตามสถานะหรือสอบถามกับผู้จัดการแข่งขัน
        </p>

        <div className="flex w-full flex-col gap-2">
          <Link href="/participants">
            <Button variant="secondary" fullWidth>
              ดูรายชื่อผู้เข้าแข่งขัน
            </Button>
          </Link>
          <Link href="/">
            <Button fullWidth>กลับหน้าหลัก</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
