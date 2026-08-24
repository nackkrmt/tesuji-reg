"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn, formatThaiDate, formatThaiDateTime } from "@/lib/utils";
import { CategoryTable } from "@/components/home/CategoryTable";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Skeleton } from "@/components/ui/Skeleton";
import { useI18n } from "@/lib/i18n";
import { listDivisions } from "@/lib/live/client";
import {
  IconBroadcast,
  IconChevronRight,
  IconDoc,
  IconPin,
  IconStone,
} from "@/components/icons";
import { useTournament } from "@/components/tournament/TournamentProvider";
import {
  RegisterCta,
  RegStatusPill,
  regState,
} from "@/components/tournament/RegisterCta";

type LiveState = "loading" | "ready" | "none";

/** Overview tab of /t/[tid] — hero (sole owner of the tournament name),
 *  register CTA/status, the rules + live quick row, venue + a three-step
 *  registration/competition timeline, and the category table. */
export default function TournamentDetailClient() {
  const { t, locale } = useI18n();
  const { tournament, categories } = useTournament();
  const { win, allFull } = regState(tournament, categories);

  // Live board tri-state: skeleton while checking, explained when absent —
  // never the enabled→disabled flicker the boolean used to cause.
  const [liveState, setLiveState] = useState<LiveState>("loading");
  useEffect(() => {
    let active = true;
    setLiveState("loading");
    listDivisions(tournament.id)
      .then((divs) => {
        if (active) setLiveState(divs.length > 0 ? "ready" : "none");
      })
      .catch(() => {
        if (active) setLiveState("none");
      });
    return () => {
      active = false;
    };
  }, [tournament.id]);

  return (
    <main className="mx-auto max-w-app px-4 pb-dock pt-3">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]">
        {tournament.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tournament.bannerUrl}
            alt={tournament.nameTh}
            className="h-52 w-full object-cover sm:h-60"
          />
        ) : (
          <GobanFallback />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <RegStatusPill win={win} full={allFull} />
          <h1 className="mt-2 text-xl font-bold text-white text-balance drop-shadow">
            {tournament.nameTh}
          </h1>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <RegisterCta
          tournament={tournament}
          categories={categories}
          href={`/t/${tournament.id}/register`}
        />

        {/* Quick access — rules + the live board (/live/* is a raw route
            handler, not a Next page: plain <a>). */}
        <div className="grid grid-cols-2 gap-2.5">
          <QuickTile href={`/t/${tournament.id}/rules`} label={t.nav.rules}>
            <IconDoc size={18} />
          </QuickTile>
          {liveState === "loading" ? (
            <div
              aria-hidden="true"
              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3"
            >
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-4 w-16" />
            </div>
          ) : (
            <QuickTile
              href={`/live/${tournament.id}`}
              external
              disabled={liveState === "none"}
              label={t.nav.live}
              note={liveState === "none" ? t.tourn.liveNotReady : undefined}
            >
              <IconBroadcast size={18} />
            </QuickTile>
          )}
        </div>
      </div>

      {/* Venue + timeline */}
      <div className="glass-card mt-4 divide-y divide-white/[0.07] rounded-3xl">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <IconWrap>
            <IconPin size={18} />
          </IconWrap>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ink-tertiary">{t.home.location}</p>
            <p className="font-medium text-ink">{tournament.locationText}</p>
            {tournament.locationMapsUrl && (
              <a
                href={tournament.locationMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring mt-1 inline-flex items-center gap-1 rounded-lg text-sm font-medium text-brand-300 transition-colors hover:text-brand-200"
              >
                {t.home.openInMaps}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
                </svg>
              </a>
            )}
          </div>
        </div>
        <Timeline
          steps={[
            {
              label: t.home.regOpens,
              value: formatThaiDateTime(tournament.registrationOpensAt, locale),
              at: Date.parse(tournament.registrationOpensAt),
            },
            {
              label: t.home.regCloses,
              value: formatThaiDateTime(tournament.registrationClosesAt, locale),
              at: Date.parse(tournament.registrationClosesAt),
            },
            {
              label: t.home.competitionDate,
              value: formatThaiDate(tournament.competitionDate, locale),
              at: competitionEnd(tournament.competitionDate),
            },
          ]}
        />
      </div>

      {/* Categories */}
      <section className="mt-6">
        <SectionHeading count={categories.length}>
          {t.home.categoriesTitle}
        </SectionHeading>
        <CategoryTable categories={categories} win={win} />
      </section>
    </main>
  );
}

/** End-of-day timestamp for a date-only competitionDate; NaN for legacy
 *  free-text rows (renders as a future/hollow step, which is the honest
 *  "unknown" treatment). */
function competitionEnd(dateStr: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr ?? "");
  return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T23:59:59+07:00`) : NaN;
}

/** Three-step registration → competition rail. Past steps are filled brand,
 *  the step the tournament is currently heading toward is emerald-ringed,
 *  the rest are hollow. */
function Timeline({
  steps,
}: {
  steps: Array<{ label: string; value: string; at: number }>;
}) {
  const now = Date.now();
  // First step still ahead = the one the tournament is heading toward. An
  // unparseable date (NaN) is neither past nor current — it renders hollow.
  const currentIdx = steps.findIndex(
    (s) => Number.isFinite(s.at) && now < s.at,
  );
  return (
    <ol className="space-y-0 px-4 py-3.5">
      {steps.map((step, i) => {
        const past = now >= step.at;
        const current = i === currentIdx;
        const last = i === steps.length - 1;
        return (
          <li key={step.label} className="relative flex gap-3 pb-0">
            {/* rail */}
            <span className="flex w-4 flex-col items-center">
              <span
                className={cn(
                  "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                  current
                    ? "bg-emerald-400 ring-4 ring-emerald-400/20"
                    : past
                      ? "bg-brand-400"
                      : "border border-white/25",
                )}
              />
              {!last && <span className="my-1 w-px flex-1 bg-white/10" />}
            </span>
            <div className={cn("min-w-0", !last && "pb-3")}>
              <p className="text-xs text-ink-tertiary">{step.label}</p>
              <p
                className={cn(
                  "text-sm font-medium",
                  past && !current ? "text-ink-secondary" : "text-ink",
                )}
              >
                {step.value}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Banner-less hero: brand gradient + a faint goban grid + two stones. */
function GobanFallback() {
  return (
    <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-brand-600 via-brand-800 to-[#06122a]">
      <svg
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {[20, 40, 60, 80].map((p) => (
          <g key={p} stroke="rgba(255,255,255,0.08)" strokeWidth="0.4">
            <line x1={p} y1="0" x2={p} y2="100" />
            <line x1="0" y1={p} x2="100" y2={p} />
          </g>
        ))}
      </svg>
      <span aria-hidden="true" className="absolute right-6 top-4 text-white/12">
        <IconStone size={64} />
      </span>
      <span aria-hidden="true" className="absolute right-16 top-12 text-black/35">
        <IconStone size={40} />
      </span>
    </div>
  );
}

function QuickTile({
  href,
  external,
  disabled,
  label,
  note,
  children,
}: {
  href: string;
  external?: boolean; // plain <a>, for routes outside the Next.js page tree
  disabled?: boolean;
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  const cls = cn(
    "flex items-center gap-3 rounded-2xl border px-3.5 py-3",
    disabled
      ? "cursor-not-allowed border-white/5 bg-white/[0.02]"
      : "focus-ring press hover-glass border-white/10 bg-white/[0.04]",
  );
  const content = (
    <>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
          disabled
            ? "bg-white/[0.03] text-white/25 ring-white/5"
            : "bg-white/[0.06] text-brand-300 ring-white/10",
        )}
      >
        {children}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-medium",
            disabled ? "text-ink-faint" : "text-ink-secondary",
          )}
        >
          {label}
        </span>
        {note && (
          <span className="block text-xs text-ink-tertiary">{note}</span>
        )}
      </span>
      {!disabled && (
        <span className="shrink-0 text-ink-faint">
          <IconChevronRight size={16} />
        </span>
      )}
    </>
  );
  if (disabled) {
    return (
      <div className={cls} aria-disabled="true">
        {content}
      </div>
    );
  }
  if (external) {
    return (
      <a href={href} className={cls}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {content}
    </Link>
  );
}

function IconWrap({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 ring-1 ring-inset ring-white/10">
      {children}
    </span>
  );
}
