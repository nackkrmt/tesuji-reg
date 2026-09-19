"use client";

import { useEffect, useState } from "react";
import { cn, formatThaiDate, formatThaiDateTime } from "@/lib/utils";
import { CategoryTable } from "@/components/home/CategoryTable";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TournamentMenu, type LiveState } from "@/components/tournament/TournamentMenu";
import { useI18n } from "@/lib/i18n";
import { listDivisions, myJudgeAssignments } from "@/lib/live/client";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  IconFlag,
  IconPin,
  IconStone,
} from "@/components/icons";
import { useTournament } from "@/components/tournament/TournamentProvider";
import { OverviewSkeleton } from "@/components/tournament/OverviewSkeleton";
import { isCompetitionDay } from "@/lib/tournament-list";
import {
  RegisterCta,
  RegStatusPill,
  regState,
} from "@/components/tournament/RegisterCta";

/** Overview tab of /t/[tid] — hero (sole owner of the tournament name),
 *  register CTA/status, the rules + live quick row, venue + a three-step
 *  registration/competition timeline, and the category table. */
export default function TournamentDetailClient() {
  const { t, locale } = useI18n();
  const { tournament, categories } = useTournament();
  const { user, loading: authLoading } = useAuth();
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

  // On the competition day, nobody opens the tournament's page for the
  // tournament's page — they open it for the pairings. So hand them straight
  // to the board, under three conditions:
  //
  //   · it is actually the competition day in Bangkok (isCompetitionDay);
  //   · the board has divisions behind it. An empty board at 7am, before the
  //     organiser has paired, is strictly worse than the overview — which is
  //     why this waits on the same check the ผลการจับคู่ tile waits on rather
  //     than redirecting on the date alone;
  //   · it has not already happened this session. The board's own ← comes back
  //     here, so redirecting every time would trap anyone who returned for the
  //     venue, the schedule or the participant list. First open of the day
  //     goes to the board; come back and the overview stays put.
  const competitionDay = isCompetitionDay(tournament);
  const [autoOpening, setAutoOpening] = useState(false);
  useEffect(() => {
    if (!competitionDay || liveState !== "ready") return;
    const key = `tesuji.autoLive.${tournament.id}`;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(key) !== null;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Private mode / storage disabled: the redirect still fires, it just
      // stops being once-only. Losing the overview is the milder failure.
    }
    if (seen) return;
    setAutoOpening(true);
    // /live/[tid] is a raw route handler outside the Next app, so this is a
    // document navigation, not a router push — and replace(), so the browser's
    // back button returns to wherever they came from instead of landing on a
    // page that would send them here again.
    window.location.replace(`/live/${tournament.id}`);
  }, [competitionDay, liveState, tournament.id]);

  // This user's judge token for THIS tournament, or null when they judge
  // elsewhere or nowhere. judge_my_assignments answers a non-judge with an
  // empty list rather than an error, so no failure surfaces to the 99% of
  // visitors who are here to register.
  const [judgeToken, setJudgeToken] = useState<string | null>(null);
  useEffect(() => {
    if (authLoading || !user) {
      setJudgeToken(null);
      return;
    }
    let active = true;
    myJudgeAssignments()
      .then((rows) => {
        if (!active) return;
        setJudgeToken(
          rows.find((r) => r.tournamentId === tournament.id)?.token ?? null,
        );
      })
      .catch(() => {
        if (active) setJudgeToken(null);
      });
    return () => {
      active = false;
    };
  }, [authLoading, user, tournament.id]);

  // Competition day: hold the skeleton until the board check answers, so the
  // hand-off reads as the page still loading. Without this the overview paints
  // in full and then jumps out from under the reader a few hundred
  // milliseconds later. On every other day this is never true and the overview
  // renders as before.
  if (autoOpening || (competitionDay && liveState === "loading")) {
    return <OverviewSkeleton />;
  }

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

        {/* A judge of this event gets their console on the first screen, the
            way v1 had it — above the public tiles, because on competition
            morning it is the only thing they open. */}
        <JudgeConsolePanel token={judgeToken} liveState={liveState} />
      </div>

      {/* The tournament's own menu — v1's grid of square tiles (0855ebb). */}
      <TournamentMenu liveState={liveState} />

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

/** The judge console: a 2:1 block, half the height of the column's width.
 *
 *  It renders for nobody except a judge of THIS tournament, and for that one
 *  person, on the one morning it appears, it is the only control on the screen
 *  that matters — so it is the largest thing on the page. Size is the whole of
 *  its emphasis: every colour, border, surface and text token below is the
 *  tiles' own, so the block reads as one more entry in the same menu, just the
 *  one you cannot miss. (It used to be amber, matching a judge section on the
 *  /results hub; that section is gone and so is the colour.)
 *
 *  No caption on the unavailable state, matching the tiles below it: dimmed
 *  and unclickable is the whole message.
 *
 *  Held back while the board check is still in flight, so it never flips
 *  enabled→disabled under their thumb. /judge/[key] is a raw route handler,
 *  not a Next page: plain <a>. */
function JudgeConsolePanel({
  token,
  liveState,
}: {
  token: string | null;
  liveState: LiveState;
}) {
  const { t } = useI18n();
  if (!token || liveState === "loading") return null;
  const ready = liveState === "ready";
  const cls = cn(
    "flex aspect-[2/1] w-full flex-col items-center justify-center gap-3 rounded-2xl border text-center",
    ready
      ? "focus-ring press hover-glass border-white/10 bg-white/[0.04]"
      : "cursor-not-allowed border-white/5 bg-white/[0.02]",
  );
  const content = (
    <>
      <span
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-2xl ring-1 ring-inset",
          ready
            ? "bg-white/[0.06] text-ink-secondary ring-white/10"
            : "bg-white/[0.03] text-white/25 ring-white/5",
        )}
      >
        <IconFlag size={36} />
      </span>
      <span
        className={cn(
          "text-xl font-bold",
          ready ? "text-ink-secondary" : "text-ink-faint",
        )}
      >
        {t.nav.judgeConsole}
      </span>
    </>
  );
  return ready ? (
    <a href={`/judge/${token}`} className={cls}>
      {content}
    </a>
  ) : (
    <div className={cls} aria-disabled="true">
      {content}
    </div>
  );
}

function IconWrap({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-ink-secondary ring-1 ring-inset ring-white/10">
      {children}
    </span>
  );
}
