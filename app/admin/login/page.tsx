"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { setAdminAuthed } from "@/lib/admin-auth";
import { useDataLayer } from "@/lib/data/store";
import { Button } from "@/components/ui/Button";
import { Field, PasswordInput, TextInput } from "@/components/ui/form";
import { Card } from "@/components/ui/Card";

export default function AdminLoginPage() {
  const router = useRouter();
  const dl = useDataLayer();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await dl.signIn(email.trim(), password);
      // Signed in — but only accounts holding the admin role may enter. Non-admin
      // accounts get signed straight back out so no stray session lingers.
      if (!(await dl.isAdmin())) {
        await dl.signOut();
        setError("บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ");
        return;
      }
      setAdminAuthed(true);
      router.replace("/admin");
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "EMAIL_NOT_CONFIRMED") {
        setError("บัญชีนี้ยังไม่ได้ยืนยันอีเมล");
      } else if (msg === "INVALID_CREDENTIALS") {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      } else {
        setError("เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen-safe items-center justify-center px-4">
      <Card className="w-full max-w-sm p-7 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_8px_22px_-8px_rgba(10,132,255,0.9)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.svg" alt="" className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-bold text-white">
            เข้าสู่ระบบหลังบ้าน
          </h1>
          <p className="mt-1 text-sm text-white/45">
            TesujiReg — ระบบจัดการการแข่งขัน
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="อีเมลผู้ดูแล">
            <TextInput
              type="email"
              value={email}
              autoFocus
              autoComplete="email"
              onChange={(e) => {
                setEmail(e.target.value);
                setError(undefined);
              }}
              placeholder="you@example.com"
              invalid={!!error}
            />
          </Field>
          <Field label="รหัสผ่าน" error={error}>
            <PasswordInput
              value={password}
              autoComplete="current-password"
              onChange={(e) => {
                setPassword(e.target.value);
                setError(undefined);
              }}
              placeholder="รหัสผ่านบัญชี"
              invalid={!!error}
            />
          </Field>
          <Button type="submit" fullWidth loading={busy}>
            เข้าสู่ระบบ
          </Button>
        </form>
        <p className="mt-5 border-t border-white/10 pt-4 text-center text-xs text-white/40">
          เข้าสู่ระบบด้วยบัญชีที่ได้รับสิทธิ์ผู้ดูแลระบบเท่านั้น
        </p>
      </Card>
    </div>
  );
}
