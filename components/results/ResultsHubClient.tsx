"use client";

import { useEffect, useState } from "react";
import { cn, formatThaiDate } from "@/lib/utils";
import { PublicHeader } from "@/components/PublicHeader";
import { EmptyState } from "@/components/ui/feedback";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLiveQuery } from "@/lib/data/store";
import type { Tournament } from "@/lib/data/types";
import { useI18n } from "@/lib/i18n";
import {
  getJudgeToken,
  getMyJudgeStatus,
  listDivisions,
} from "@/lib/live/client";
import type { LiveDivision } from "@/lib/live/types";
import { groupForHome } from "@/lib/tournament-list";
import {
  IconBroadcast,
  IconCalendar,
  IconChevronRight,
  IconFlag,
  IconPin,
} from "@/components/icons";

/** วันนี้ตามเวลาไทยตรงกับ competitionDate ไหม — the honesty test for the
 *  "กำลังแข่งขัน" label (a tournament three weeks out is NOT live). */
function isCompetitionToday(t: Tournament): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t.competitionDate ?? "");
  if (!m) return false;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
  }).format(new Date());
  return `${m[1]}-${m[2]}-${m[3]}` === today;
}

/** ผลการแข่งขัน hub — one card per tournament that has a live board, current
 *  events first; unassigned boards fall back to the legacy global page.
 *  Judges get a visually distinct tool row of their own. */
export default function ResultsHubClient() {
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();

  const { data: tournaments } = useLiveQuery(
    (d) => d.listTournaments(),
    [],
    ["tournament"],
  );
  const [divisions, setDivisions] = useState<LiveDivision[] | null>(null);
  const [isJudge, setIsJudge] = useState(false);

  useEffect(() => {
    let active = true;
    listDivisions()
      .then((divs) => {
        if (active) setDivisions(divs);
      })
      .catch(() => {
        if (active) setDivisions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsJudge(false);
      return;
    }
    let active = true;
    getMyJudgeStatus()
      .then(({ isJudge: judge }) => {
        if (active) setIsJudge(judge);
      })
      .catch(() => {
        if (active) setIsJudge(false);
      });
    return () => {
      active = false;
    };
  }, [authLoading, user]);

  async function openJudgeConsole() {
    try {
      const token = await getJudgeToken();
      window.location.href = `/judge/${token}`;
    } catch {
      // ignore — role may have just been revoked
    }
  }

  const ready = divisions !== null && tournaments !== undefined;
  const hasLiveData = (divisions?.length ?? 0) > 0;

  // Tournaments that own at least one board, current events first.
  const withBoards = new Set(
    (divisions ?? []).map((d) => d.tournamentId).filter(Boolean) as string[],
  );
  const groups = groupForHome(tournaments ?? []);
  const boardTournaments = [
    ...groups.open,
    ...groups.upcoming,
    ...groups.finished,
  ].filter((row) => withBoards.has(row.id));
  const hasUnassigned = (divisions ?? []).some((d) => d.tournamentId === null);

  return (
    <>
      <PublicHeader title={t.results.title} />
      <main
        aria-busy={!ready || undefined}
        className="mx-auto max-w-app px-4 pb-dock pt-4"
      >
        <p className="mb-4 text-sm text-ink-tertiary">{t.results.subtitle}</p>

        {!ready ? (
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </div>
        ) : !hasLiveData ? (
          <div className="pt-4">
            <EmptyState
              title={t.results.emptyTitle}
              description={t.results.emptyDesc}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {boardTournaments.map((row, i) => (
              <BoardCard
                key={row.id}
                tournament={row}
                live={isCompetitionToday(row)}
                delayIndex={i}
              />
            ))}
            {hasUnassigned && (
              // Boards not assigned to a tournament yet → the legacy global
              // board (a raw route handler — plain <a>, not <Link>).
              <a
                href="/live"
                className="focus-ring press hover-glass flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-3.5 text-sm font-medium text-ink-secondary transition-colors"
              >
                <span className="text-brand-300">
                  <IconBroadcast size={18} />
                </span>
                {t.nav.live}
              </a>
            )}
          </div>
        )}

        {isJudge && (
          <section className="mt-6">
            <SectionHeading>{t.results.judgeSection}</SectionHeading>
            <button
              type="button"
              onClick={hasLiveData ? openJudgeConsole : undefined}
              aria-disabled={!hasLiveData || undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left",
                hasLiveData
                  ? "focus-ring press border-amber-400/25 bg-amber-400/[0.06] transition-colors hover:bg-amber-400/[0.1]"
                  : "cursor-not-allowed border-white/5 bg-white/[0.02]",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                  hasLiveData
                    ? "bg-amber-400/10 text-amber-300 ring-amber-400/25"
                    : "bg-white/[0.03] text-white/25 ring-white/5",
                )}
              >
                <IconFlag size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm font-semibold",
                    hasLiveData ? "text-ink" : "text-ink-faint",
                  )}
                >
                  {t.nav.judgeConsole}
                </span>
                {!hasLiveData && (
                  <span className="block text-xs text-ink-tertiary">
                    {t.results.judgeNeedsBoard}
                  </span>
                )}
              </span>
              {hasLiveData && (
                <span className="shrink-0 text-ink-faint">
                  <IconChevronRight size={16} />
                </span>
              )}
            </button>
          </section>
        )}
      </main>
    </>
  );
}

function BoardCard({
  tournament,
  live,
  delayIndex,
}: {
  tournament: Tournament;
  live: boolean;
  delayIndex: number;
}) {
  const { t, locale } = useI18n();
  return (
    <a
      href={`/live/${tournament.id}`}
      className={cn(
        "focus-ring press hover-glass flex animate-rise-in items-center gap-3 rounded-3xl border px-4 py-3.5 transition-colors",
        live ? "border-brand-400/25 bg-brand-500/10" : "border-white/10 bg-white/[0.04]",
      )}
      style={{ animationDelay: `${Math.min(delayIndex, 8) * 30}ms` }}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
          live
            ? "bg-brand-500/15 text-brand-300 ring-brand-400/25"
            : "bg-white/[0.06] text-ink-tertiary ring-white/10",
        )}
      >
        <IconBroadcast size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-bold text-ink">
          {tournament.nameTh}
        </span>
        <span className="mt-0.5 flex items-center gap-3 text-sm text-ink-tertiary">
          {live ? (
            <span className="font-medium text-brand-300">
              {t.results.liveNow}
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1">
              <IconCalendar size={14} />
              {formatThaiDate(tournament.competitionDate, locale)}
            </span>
          )}
          {tournament.locationText && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <IconPin size={14} className="shrink-0" />
              <span className="truncate">{tournament.locationText}</span>
            </span>
          )}
        </span>
      </span>
      <span className="shrink-0 text-ink-faint">
        <IconChevronRight size={20} />
      </span>
    </a>
  );
}
