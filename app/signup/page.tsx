"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/form";

function SignupInner() {
  const { signUp } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

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
      const r = await signUp(email.trim(), password);
      if (r.needsEmailConfirm) {
        setEmailSent(true);
      } else {
        router.replace(
          next ? `/profile?next=${encodeURIComponent(next)}` : "/profile",
        );
      }
    } catch (err) {
      const m = (err as Error).message;
      setError(
        m === "EMAIL_EXISTS" || m.toLowerCase().includes("already registered")
          ? "อีเมลนี้มีบัญชีอยู่แล้ว — ลองเข้าสู่ระบบแทน"
          : "สมัครไม่สำเร็จ: " + m,
      );
    } finally {
      setBusy(false);
    }
  }

  if (emailSent) {
    return (
      <Card className="w-full max-w-sm p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-sky-400/15 text-2xl ring-1 ring-inset ring-sky-400/25">
          ✉️
        </div>
        <h1 className="text-lg font-bold text-white">ตรวจสอบอีเมลของคุณ</h1>
        <p className="mt-2 text-sm text-white/55">
          เราส่งลิงก์ยืนยันไปที่ <b className="text-white/80">{email}</b> แล้ว
          กรุณาคลิกลิงก์ในอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ
        </p>
        <Link href="/login" className="mt-4 inline-block">
          <Button variant="secondary">ไปหน้าเข้าสู่ระบบ</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="mb-1 text-lg font-bold text-white">สมัครบัญชีใหม่</h1>
      <p className="mb-5 text-sm text-white/45">
        สร้างบัญชีครั้งเดียว ครั้งต่อไปไม่ต้องกรอกข้อมูลซ้ำ
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
        <Field label="รหัสผ่าน" hint="อย่างน้อย 6 ตัวอักษร">
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Field label="ยืนยันรหัสผ่าน">
          <TextInput
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" fullWidth loading={busy}>
          สมัครบัญชี
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-white/50">
        มีบัญชีแล้ว?{" "}
        <Link
          href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-brand-300 hover:text-brand-200"
        >
          เข้าสู่ระบบ
        </Link>
      </p>
    </Card>
  );
}

export default function SignupPage() {
  return (
    <>
      <PublicHeader back="/" title="สมัครบัญชี" />
      <main className="mx-auto flex max-w-app justify-center px-4 pb-dock pt-8">
        <Suspense fallback={<div className="h-64" />}>
          <SignupInner />
        </Suspense>
      </main>
    </>
  );
}
