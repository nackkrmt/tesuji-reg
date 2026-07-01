"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, PasswordInput, TextInput } from "@/components/ui/form";
import { safeInternalPath } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

function LoginInner() {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeInternalPath(params.get("next"), "/");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await signIn(email.trim(), password);
      router.replace(next);
    } catch (err) {
      const m = (err as Error).message;
      setError(
        m === "EMAIL_NOT_CONFIRMED"
          ? t.auth.errEmailNotConfirmed
          : m === "INVALID_CREDENTIALS"
            ? t.auth.errInvalidCredentials
            : t.auth.errLoginFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="mb-1 text-lg font-bold text-white">{t.auth.loginTitle}</h1>
      <p className="mb-5 text-sm text-white/45">{t.auth.loginSubtitle}</p>
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
        <Field label={t.auth.password}>
          <PasswordInput
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t.auth.passwordPlaceholder}
            required
          />
        </Field>
        <div className="-mt-1 text-right">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-brand-300 hover:text-brand-200"
          >
            {t.auth.forgotPassword}
          </Link>
        </div>
        <Button type="submit" fullWidth loading={busy}>
          {t.auth.signInButton}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-white/50">
        {t.auth.noAccount}{" "}
        <Link
          href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-semibold text-brand-300 hover:text-brand-200"
        >
          {t.auth.createAccountLink}
        </Link>
      </p>
    </Card>
  );
}

function LoginHeader() {
  const { t } = useI18n();
  return <PublicHeader back="/" title={t.auth.loginTitle} />;
}

export default function LoginPage() {
  return (
    <>
      <LoginHeader />
      <main className="mx-auto flex max-w-app justify-center px-4 pb-dock pt-8">
        <Suspense fallback={<div className="h-64" />}>
          <LoginInner />
        </Suspense>
      </main>
    </>
  );
}
