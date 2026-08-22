"use client";

import Link from "next/link";
import { useLiveQuery } from "@/lib/data/store";
import type { Tournament } from "@/lib/data/types";
import { formatThaiDate } from "@/lib/utils";
import { PublicHeader } from "@/components/PublicHeader";
import {
  CenterLoader,
  EmptyState,
  ErrorState,
  Pill,
} from "@/components/ui/feedback";
import { useI18n } from "@/lib/i18n";
import { groupForHome, type TournamentPhase } from "@/lib/tournament-list";
import { IconCalendar, IconChevronRight, IconPin } from "@/components/icons";

/** The home page: every visible tournament, bucketed by phase —
 *  เปิดรับสมัคร → กำลังจะมาถึง → ที่ผ่านมา. Tap a card → /t/[tid]. */
export default function TournamentListClient() {
  const { t } = useI18n();
  const {
    data: tournaments,
    loading,
    error,
    refetch,
  } = useLiveQuery((d) => d.listTournaments(), []);

  if (loading) return <CenterLoader label={t.common.loading} />;

  if (error) {
    return (
      <>
        <PublicHeader />
        <main className="mx-auto max-w-app px-4 pb-dock pt-10">
          <ErrorState onRetry={refetch} />
        </main>
      </>
    );
  }

  const groups = groupForHome(tournaments ?? []);
  const isEmpty =
    groups.open.length + groups.upcoming.length + groups.finished.length === 0;

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-app px-4 pb-dock pt-3">
        {isEmpty ? (
          <div className="pt-7">
            <EmptyState
              title={t.home.listEmptyTitle}
              description={t.home.listEmptyDesc}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <Section
              title={t.home.sectionOpen}
              phase="open"
              rows={groups.open}
            />
            <Section
              title={t.home.sectionUpcoming}
              phase="upcoming"
              rows={groups.upcoming}
            />
            <Section
              title={t.home.sectionFinished}
              phase="finished"
              rows={groups.finished}
            />
          </div>
        )}
      </main>
    </>
  );
}

function Section({
  title,
  phase,
  rows,
}: {
  title: string;
  phase: TournamentPhase;
  rows: Tournament[];
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2.5 text-base font-bold text-white">{title}</h2>
      <div className="space-y-3">
        {rows.map((row) => (
          <TournamentCard key={row.id} tournament={row} phase={phase} />
        ))}
      </div>
    </section>
  );
}

function PhasePill({
  phase,
  tournament,
}: {
  phase: TournamentPhase;
  tournament: Tournament;
}) {
  const { t } = useI18n();
  if (phase === "open") return <Pill tone="good">{t.home.pillOpen}</Pill>;
  if (phase === "finished") return <Pill tone="neutral">{t.home.closed}</Pill>;
  // upcoming: registration not open yet vs already closed but event ahead
  return tournament.status === "published" &&
    Date.now() < Date.parse(tournament.registrationOpensAt) ? (
    <Pill tone="warn">{t.home.notYetOpen}</Pill>
  ) : (
    <Pill tone="bad">{t.home.closed}</Pill>
  );
}

function TournamentCard({
  tournament,
  phase,
}: {
  tournament: Tournament;
  phase: TournamentPhase;
}) {
  const { locale } = useI18n();
  const dim = phase === "finished";
  return (
    <Link
      href={`/t/${tournament.id}`}
      className="hover-glass block overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition"
    >
      {tournament.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tournament.bannerUrl}
          alt=""
          className={`h-32 w-full object-cover ${dim ? "opacity-60 saturate-50" : ""}`}
        />
      ) : (
        <div className="h-20 w-full bg-gradient-to-br from-brand-700/60 via-brand-900/60 to-[#06122a]" />
      )}
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <PhasePill phase={phase} tournament={tournament} />
          <p className="mt-1.5 truncate font-bold text-white">
            {tournament.nameTh}
          </p>
          <p className="mt-1 flex items-center gap-3 text-sm text-white/50">
            <span className="inline-flex items-center gap-1">
              <IconCalendar size={14} />
              {formatThaiDate(tournament.competitionDate, locale)}
            </span>
            {tournament.locationText && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <IconPin size={14} className="shrink-0" />
                <span className="truncate">{tournament.locationText}</span>
              </span>
            )}
          </p>
        </div>
        <span className="shrink-0 text-white/30">
          <IconChevronRight size={20} />
        </span>
      </div>
    </Link>
  );
}
