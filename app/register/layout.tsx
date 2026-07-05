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
      router.replace("/login?next=/register");
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
        <RegisterGate>
          <div className="mx-auto max-w-app px-5 pt-4">
            <Stepper steps={steps} current={stepIndex} />
          </div>
          {children}
        </RegisterGate>
      ) : (
        children
      )}
    </RegisterFlowProvider>
  );
}
