"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, PasswordInput, TextInput } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n";

function SignupInner() {
  const { signUp } = useAuth();
  const { t } = useI18n();
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
          ? t.auth.errEmailExists
          : t.auth.errSignupFailed(m),
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
        <h1 className="text-lg font-bold text-white">{t.auth.checkEmailTitle}</h1>
        <p className="mt-2 text-sm text-white/55">
          {t.auth.confirmSentLead}
          <b className="text-white/80">{email}</b>
          {t.auth.confirmSentTail}
        </p>
        <Link href="/login" className="mt-4 inline-block">
          <Button variant="secondary">{t.auth.goToLogin}</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="mb-1 text-lg font-bold text-white">{t.auth.signupHeading}</h1>
      <p className="mb-5 text-sm text-white/45">
        {t.auth.signupSubtitle}
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
        <Field label={t.auth.password} hint={t.auth.passwordHint}>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Field label={t.auth.confirmPassword}>
          <PasswordInput
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" fullWidth loading={busy}>
          {t.auth.signUpButton}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-white/50">
        {t.auth.haveAccount}{" "}
        <Link
          href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-brand-300 hover:text-brand-200"
        >
          {t.auth.signInLink}
        </Link>
      </p>
    </Card>
  );
}

function SignupHeader() {
  const { t } = useI18n();
  return <PublicHeader back="/" title={t.auth.signupTitle} />;
}

export default function SignupPage() {
  return (
    <>
      <SignupHeader />
      <main className="mx-auto flex max-w-app justify-center px-4 pb-dock pt-8">
        <Suspense fallback={<div className="h-64" />}>
          <SignupInner />
        </Suspense>
      </main>
    </>
  );
}
