"use client";

import { ReactNode } from "react";
import { PublicHeader } from "@/components/PublicHeader";
import { Card } from "@/components/ui/Card";
import { useI18n } from "@/lib/i18n";
import { formatThaiDate } from "@/lib/utils";

/** The date readers see. Bump it in the same change that edits any privacy.*
 *  string — a notice whose date lags its text is worse than one with no date. */
const LAST_UPDATED = "2026-09-04";

/** /privacy — the PDPA notice the registration consent box links to. Static
 *  text from the dictionary, so it switches with the app's TH/EN toggle like
 *  every other player-facing page. */
export default function PrivacyPage() {
  const { t, locale } = useI18n();
  const p = t.privacy;

  return (
    <>
      <PublicHeader back="/" title={p.title} />
      <main className="mx-auto max-w-app px-4 pb-dock pt-4">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-ink-secondary">{p.intro}</p>
            <p className="mt-2 text-xs text-ink-tertiary">
              {p.updated(formatThaiDate(LAST_UPDATED, locale))}
            </p>
          </div>

          {/* The organizer's real name and contact are the one thing this page
              can't supply for itself, and a PDPA notice with no reachable
              controller is unusable. So the gap is shown in amber rather than
              filled with plausible-looking text that nobody would notice. */}
          <Card className="space-y-3 p-5 ring-1 ring-inset ring-amber-400/25">
            <h2 className="text-base font-bold text-ink">{p.controllerTitle}</h2>
            <p className="text-sm text-ink-secondary">{p.controllerBody}</p>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-semibold text-ink">
                  {p.controllerNameLabel}
                </dt>
                <dd className="text-amber-200">{p.controllerNamePlaceholder}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">
                  {p.controllerContactLabel}
                </dt>
                <dd className="text-amber-200">
                  {p.controllerContactPlaceholder}
                </dd>
              </div>
            </dl>
            <p className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {p.controllerTodo}
            </p>
          </Card>

          <Section title={p.collectTitle}>
            <Terms
              items={[
                { term: p.collectAccountTerm, body: p.collectAccountBody },
                { term: p.collectPersonTerm, body: p.collectPersonBody },
                { term: p.collectSubmitterTerm, body: p.collectSubmitterBody },
                { term: p.collectRankTerm, body: p.collectRankBody },
                { term: p.collectPaymentTerm, body: p.collectPaymentBody },
                { term: p.collectRefundTerm, body: p.collectRefundBody },
              ]}
            />
            <p className="text-sm text-ink-tertiary">{p.collectNote}</p>
          </Section>

          <Section title={p.useTitle}>
            <Bullets
              items={[
                p.useRegister,
                p.useEligibility,
                p.usePayment,
                p.usePairing,
                p.useAwards,
                p.useRefund,
              ]}
            />
          </Section>

          <Section title={p.shareTitle}>
            <Terms
              items={[
                { term: p.sharePublicTerm, body: p.sharePublicBody },
                { term: p.shareOrganizerTerm, body: p.shareOrganizerBody },
                { term: p.shareAssociationTerm, body: p.shareAssociationBody },
                { term: p.shareProcessorsTerm, body: p.shareProcessorsBody },
              ]}
            />
            <p className="text-sm text-ink-tertiary">{p.shareNote}</p>
          </Section>

          <Section title={p.minorTitle}>
            <p className="text-sm text-ink-secondary">{p.minorBody}</p>
          </Section>

          <Section title={p.keepTitle}>
            <Bullets
              items={[
                p.keepProfileBody,
                p.keepRegistrationBody,
                p.keepNoAutoBody,
                p.keepRecordBody,
              ]}
            />
          </Section>

          <Section title={p.rightsTitle}>
            <p className="text-sm text-ink-secondary">{p.rightsIntro}</p>
            <Terms
              items={[
                { term: p.rightAccessTerm, body: p.rightAccessBody },
                { term: p.rightRectifyTerm, body: p.rightRectifyBody },
                { term: p.rightEraseTerm, body: p.rightEraseBody },
                { term: p.rightWithdrawTerm, body: p.rightWithdrawBody },
                { term: p.rightComplainTerm, body: p.rightComplainBody },
              ]}
            />
            <p className="text-sm text-ink-tertiary">{p.rightsContactNote}</p>
          </Section>

          <Section title={p.securityTitle}>
            <p className="text-sm text-ink-secondary">{p.securityBody}</p>
          </Section>

          <Section title={p.changesTitle}>
            <p className="text-sm text-ink-secondary">{p.changesBody}</p>
          </Section>
        </div>
      </main>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {children}
    </Card>
  );
}

/** label → detail rows. The label carries the scanning weight so a reader
 *  looking for one thing (their bank details, their rights) finds it without
 *  reading the whole notice. */
function Terms({ items }: { items: { term: string; body: string }[] }) {
  return (
    <dl className="space-y-3">
      {items.map((it) => (
        <div key={it.term}>
          <dt className="text-sm font-semibold text-ink">{it.term}</dt>
          <dd className="mt-0.5 text-sm text-ink-secondary">{it.body}</dd>
        </div>
      ))}
    </dl>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 text-sm text-ink-secondary">
          <span
            aria-hidden="true"
            className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-brand-400"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
