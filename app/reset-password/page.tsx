"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, PasswordInput } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n";

function ResetPasswordInner() {
  const { user, loading, updatePassword } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError(t.auth.errPasswordMin);
      return;
    }
    if (password !== confirm) {
      setError(t.auth.errPasswordMismatch);
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
          ? t.auth.errRecoveryMissing
          : t.auth.errResetFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  // Waiting for the recovery session to be established from the email link.
  if (loading) {
    return (
      <Card className="w-full max-w-sm p-6 text-center text-sm text-white/55">
        {t.auth.checkingLink}
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
        <h1 className="text-lg font-bold text-white">{t.auth.invalidLinkTitle}</h1>
        <p className="mt-2 text-sm text-white/55">
          {t.auth.invalidLinkDesc}
        </p>
        <Link href="/forgot-password" className="mt-4 inline-block">
          <Button variant="secondary">{t.auth.requestNewLink}</Button>
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
        <h1 className="text-lg font-bold text-white">{t.auth.resetDoneTitle}</h1>
        <p className="mt-2 text-sm text-white/55">
          {t.auth.resetDoneDesc}
        </p>
        <Button className="mt-4" onClick={() => router.replace("/")}>
          {t.auth.continueApp}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="mb-1 text-lg font-bold text-white">{t.auth.resetTitle}</h1>
      <p className="mb-5 text-sm text-white/45">
        {t.auth.resetForAccountLead}
        <b className="text-white/70">{user.email}</b>
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t.auth.newPassword} hint={t.auth.passwordHint} error={error}>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!error}
            required
          />
        </Field>
        <Field label={t.auth.confirmNewPassword}>
          <PasswordInput
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            invalid={!!error}
            required
          />
        </Field>
        <Button type="submit" fullWidth loading={busy}>
          {t.auth.saveNewPassword}
        </Button>
      </form>
    </Card>
  );
}

function ResetPasswordHeader() {
  const { t } = useI18n();
  return <PublicHeader back="/login" title={t.auth.resetTitle} />;
}

export default function ResetPasswordPage() {
  return (
    <>
      <ResetPasswordHeader />
      <main className="mx-auto flex max-w-app justify-center px-4 pb-dock pt-8">
        <ResetPasswordInner />
      </main>
    </>
  );
}
