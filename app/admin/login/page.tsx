"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ADMIN_PASSPHRASE,
  setAdminAuthed,
  setAdminSecret,
} from "@/lib/admin-auth";
import { Button } from "@/components/ui/Button";
import { Field, PasswordInput } from "@/components/ui/form";
import { Card } from "@/components/ui/Card";

export default function AdminLoginPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (value.trim() === ADMIN_PASSPHRASE) {
      setAdminSecret(value.trim());
      setAdminAuthed(true);
      router.replace("/admin");
    } else {
      setError("รหัสผ่านไม่ถูกต้อง");
    }
  }

  return (
    <div className="flex min-h-screen-safe items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 text-center">
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
          <Field label="รหัสผ่านผู้ดูแล" error={error}>
            <PasswordInput
              value={value}
              autoFocus
              onChange={(e) => {
                setValue(e.target.value);
                setError(undefined);
              }}
              placeholder="กรอกรหัสผ่าน"
              invalid={!!error}
            />
          </Field>
          <Button type="submit" fullWidth>
            เข้าสู่ระบบ
          </Button>
        </form>
        <p className="mt-4 text-center text-xs text-white/45">
          รหัสเริ่มต้นสำหรับเดโม:{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 font-semibold text-white/80">
            tesuji
          </code>
        </p>
      </Card>
    </div>
  );
}
