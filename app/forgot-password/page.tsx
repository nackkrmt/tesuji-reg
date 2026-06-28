"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/form";

function ForgotPasswordInner() {
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch {
      setError("ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sky-400/15 text-2xl ring-1 ring-inset ring-sky-400/25">
          ✉️
        </div>
        <h1 className="text-lg font-bold text-white">ตรวจสอบอีเมลของคุณ</h1>
        <p className="mt-2 text-sm text-white/55">
          ถ้ามีบัญชีที่ใช้ <b className="text-white/80">{email}</b>{" "}
          เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้แล้ว
          กรุณาคลิกลิงก์ในอีเมลเพื่อดำเนินการต่อ
        </p>
        <Link href="/login" className="mt-4 inline-block">
          <Button variant="secondary">กลับไปหน้าเข้าสู่ระบบ</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="mb-1 text-lg font-bold text-white">ลืมรหัสผ่าน</h1>
      <p className="mb-5 text-sm text-white/45">
        กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="อีเมล" error={error}>
          <TextInput
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            invalid={!!error}
            required
          />
        </Field>
        <Button type="submit" fullWidth loading={busy}>
          ส่งลิงก์รีเซ็ตรหัสผ่าน
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-white/50">
        นึกรหัสผ่านได้แล้ว?{" "}
        <Link
          href="/login"
          className="font-semibold text-brand-300 hover:text-brand-200"
        >
          เข้าสู่ระบบ
        </Link>
      </p>
    </Card>
  );
}

export default function ForgotPasswordPage() {
  return (
    <>
      <PublicHeader back="/login" title="ลืมรหัสผ่าน" />
      <main className="mx-auto flex max-w-app justify-center px-4 pb-dock pt-8">
        <ForgotPasswordInner />
      </main>
    </>
  );
}
