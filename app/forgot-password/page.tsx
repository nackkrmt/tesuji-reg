"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, TextInput } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n";

function ForgotPasswordInner() {
  const { requestPasswordReset } = useAuth();
  const { t } = useI18n();

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
      setError(t.auth.errResetRequestFailed);
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
        <h1 className="text-lg font-bold text-white">{t.auth.checkEmailTitle}</h1>
        <p className="mt-2 text-sm text-white/55">
          {t.auth.resetSentLead}
          <b className="text-white/80">{email}</b>
          {t.auth.resetSentTail}
        </p>
        <Link href="/login" className="mt-4 inline-block">
          <Button variant="secondary">{t.auth.backToLogin}</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="mb-1 text-lg font-bold text-white">{t.auth.forgotTitle}</h1>
      <p className="mb-5 text-sm text-white/45">
        {t.auth.forgotSubtitle}
      </p>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t.auth.email} error={error}>
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
          {t.auth.sendResetLink}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-white/50">
        {t.auth.rememberedPassword}{" "}
        <Link
          href="/login"
          className="font-semibold text-brand-300 hover:text-brand-200"
        >
          {t.auth.signInLink}
        </Link>
      </p>
    </Card>
  );
}

function ForgotPasswordHeader() {
  const { t } = useI18n();
  return <PublicHeader back="/login" title={t.auth.forgotTitle} />;
}

export default function ForgotPasswordPage() {
  return (
    <>
      <ForgotPasswordHeader />
      <main className="mx-auto flex max-w-app justify-center px-4 pb-dock pt-8">
        <ForgotPasswordInner />
      </main>
    </>
  );
}
