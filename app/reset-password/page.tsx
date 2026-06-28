"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, PasswordInput } from "@/components/ui/form";

function ResetPasswordInner() {
  const { user, loading, updatePassword } = useAuth();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("รหัสผ่านอย่างน้อย 6 ตัวอักษร");
      return;
    }
    if (password !== confirm) {
      setError("รหัสผ่านยืนยันไม่ตรงกัน");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      const m = (err as Error).message;
      setError(
        m === "RECOVERY_SESSION_MISSING"
          ? "ลิงก์รีเซ็ตหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง"
          : "ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองใหม่",
      );
    } finally {
      setBusy(false);
    }
  }

  // Waiting for the recovery session to be established from the email link.
  if (loading) {
    return (
      <Card className="w-full max-w-sm p-6 text-center text-sm text-white/55">
        กำลังตรวจสอบลิงก์…
      </Card>
    );
  }

  // No session means the recovery link was invalid or has expired.
  if (!user) {
    return (
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-400/15 text-2xl ring-1 ring-inset ring-rose-400/25">
          ⚠️
        </div>
        <h1 className="text-lg font-bold text-white">ลิงก์ไม่ถูกต้อง</h1>
        <p className="mt-2 text-sm text-white/55">
          ลิงก์รีเซ็ตรหัสผ่านหมดอายุหรือไม่ถูกต้อง กรุณาขอลิงก์ใหม่อีกครั้ง
        </p>
        <Link href="/forgot-password" className="mt-4 inline-block">
          <Button variant="secondary">ขอลิงก์ใหม่</Button>
        </Link>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 text-2xl ring-1 ring-inset ring-emerald-400/25">
          ✓
        </div>
        <h1 className="text-lg font-bold text-white">ตั้งรหัสผ่านใหม่แล้ว</h1>
        <p className="mt-2 text-sm text-white/55">
          คุณเข้าสู่ระบบด้วยรหัสผ่านใหม่เรียบร้อยแล้ว
        </p>
        <Button className="mt-4" onClick={() => router.replace("/")}>
          เข้าใช้งานต่อ
        </Button>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="mb-1 text-lg font-bold text-white">ตั้งรหัสผ่านใหม่</h1>
      <p className="mb-5 text-sm text-white/45">
        ตั้งรหัสผ่านใหม่สำหรับบัญชี{" "}
        <b className="text-white/70">{user.email}</b>
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 6 ตัวอักษร" error={error}>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!error}
            required
          />
        </Field>
        <Field label="ยืนยันรหัสผ่านใหม่">
          <PasswordInput
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            invalid={!!error}
            required
          />
        </Field>
        <Button type="submit" fullWidth loading={busy}>
          บันทึกรหัสผ่านใหม่
        </Button>
      </form>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <>
      <PublicHeader back="/login" title="ตั้งรหัสผ่านใหม่" />
      <main className="mx-auto flex max-w-app justify-center px-4 pb-dock pt-8">
        <ResetPasswordInner />
      </main>
    </>
  );
}
