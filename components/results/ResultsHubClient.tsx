"use client";

import { useEffect, useState } from "react";
import { cn, formatThaiDate } from "@/lib/utils";
import { PublicHeader } from "@/components/PublicHeader";
import { EmptyState } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/Skeleton";
import { useLiveQuery } from "@/lib/data/store";
import type { Tournament } from "@/lib/data/types";
import { useI18n } from "@/lib/i18n";
import { listDivisions } from "@/lib/live/client";
import type { LiveDivision } from "@/lib/live/types";
import { groupForHome } from "@/lib/tournament-list";
import {
  IconBroadcast,
  IconCalendar,
  IconChevronRight,
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
 *  events first. Boards only: the judge console used to have a section of its
 *  own down here, listing one row per tournament a signed-in judge was
 *  assigned to. It was removed by request. A judge reaches their console from
 *  the tournament's own page, where it is the big amber block above the tiles
 *  — one place instead of two, and the one that already knows which
 *  tournament is meant. */
export default function ResultsHubClient() {
  const { t } = useI18n();

  const { data: tournaments } = useLiveQuery(
    (d) => d.listTournaments(),
    [],
    ["tournament"],
  );
  const [divisions, setDivisions] = useState<LiveDivision[] | null>(null);

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

  const ready = divisions !== null && tournaments !== undefined;
  const hasLiveData = (divisions?.length ?? 0) > 0;

  // Tournaments that own at least one board, current events first.
  const withBoards = new Set((divisions ?? []).map((d) => d.tournamentId));
  const groups = groupForHome(tournaments ?? []);
  const boardTournaments = [
    ...groups.open,
    ...groups.upcoming,
    ...groups.finished,
  ].filter((row) => withBoards.has(row.id));

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
          </div>
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
