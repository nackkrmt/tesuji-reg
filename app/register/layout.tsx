"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  RegisterFlowProvider,
  useRegisterFlow,
} from "@/components/register/RegisterFlowProvider";
import { PublicHeader } from "@/components/PublicHeader";
import { Stepper } from "@/components/ui/Stepper";
import { useAuth } from "@/components/auth/AuthProvider";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/i18n";
import { formatThaiDateTime } from "@/lib/utils";
import { regWindow } from "@/lib/tournament-window";
import { externalBrowserUrl, isLineInAppBrowser } from "@/lib/browser";

/** Warns LINE in-app browser users up front and offers a one-tap escape to the
 *  system browser — the LINE webview often kills the page during the photo
 *  picker, breaking the slip upload. */
function LineBrowserBanner() {
  const { t } = useI18n();
  // Detect in an effect: the SSR/first hydration render must match (banner
  // hidden), otherwise React logs a hydration mismatch.
  const [isLine, setIsLine] = useState(false);
  useEffect(() => setIsLine(isLineInAppBrowser()), []);
  if (!isLine) return null;
  return (
    <div className="mx-auto max-w-app px-5 pt-4">
      <div className="flex items-start gap-2.5 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-3">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 shrink-0"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" x2="12" y1="9" y2="13" />
          <line x1="12" x2="12.01" y1="17" y2="17" />
        </svg>
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-amber-200">
            {t.register.lineWarnBody}
          </p>
          <button
            type="button"
            onClick={() => {
              window.location.href = externalBrowserUrl();
            }}
            className="mt-2 rounded-xl bg-amber-400/20 px-3 py-1.5 text-sm font-semibold text-amber-100 ring-1 ring-inset ring-amber-400/30 transition hover:bg-amber-400/30"
          >
            {t.register.lineWarnButton}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegisterGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { t, locale } = useI18n();
  const dl = useDataLayer();
  const router = useRouter();
  const { draft } = useRegisterFlow();
  const [state, setState] = useState<"checking" | "ok">("checking");

  // One definitive profile check once auth has settled, avoiding the
  // stale-null race that a live query can hit during session restore.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Preserve the full path+query (e.g. /register/payment?batch=…) so the
      // external-browser handoff / a lost session lands back mid-flow after
      // login instead of restarting from Step A.
      router.replace(
        `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`,
      );
      return;
    }
    let active = true;
    setState("checking");
    dl.getMyProfile().then((profile) => {
      if (!active) return;
      if (profile === null) router.replace("/profile?next=/register");
      else setState("ok");
    });
    return () => {
      active = false;
    };
  }, [loading, user, dl, router]);

  const { data: tournament, loading: tLoading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );

  if (state !== "ok" || tLoading) return <CenterLoader label={t.common.loading} />;

  // A seat hold already exists → the user is mid-flow (categories/payment).
  // Let them continue; those steps handle an expired hold on their own. Only
  // the entry point (no reservation yet) needs to block on the window, so we
  // don't let someone fill in the whole form before finding out it's closed.
  if (!draft.reservation) {
    const win = tournament ? regWindow(tournament) : "not_published";
    if (win !== "open") {
      const { title, desc } =
        win === "before" && tournament
          ? {
              title: t.register.gateTitleBefore,
              desc: t.register.gateDescBefore(
                formatThaiDateTime(tournament.registrationOpensAt, locale),
              ),
            }
          : win === "closed"
            ? { title: t.register.gateTitleClosed, desc: t.register.gateDescClosed }
            : { title: t.register.gateTitleUnavailable, desc: t.register.gateDescUnavailable };
      return (
        <div className="mx-auto max-w-app px-4 py-10">
          <EmptyState
            title={title}
            description={desc}
            action={
              <Button onClick={() => router.replace("/")}>{t.register.backHome}</Button>
            }
          />
        </div>
      );
    }
  }

  return <>{children}</>;
}

export default function RegisterLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const stepIndex = pathname.endsWith("/payment")
    ? 2
    : pathname.endsWith("/categories")
      ? 1
      : pathname.endsWith("/applicant")
        ? 0
        : -1;
  const steps = [
    t.register.steps.applicant,
    t.register.steps.categories,
    t.register.steps.payment,
  ];

  return (
    <RegisterFlowProvider>
      <PublicHeader back="/" title={t.register.title} />
      {stepIndex >= 0 ? (
        <>
          <LineBrowserBanner />
          <RegisterGate>
            <div className="mx-auto max-w-app px-5 pt-4">
              <Stepper steps={steps} current={stepIndex} />
            </div>
            {children}
          </RegisterGate>
        </>
      ) : (
        children
      )}
    </RegisterFlowProvider>
  );
}
