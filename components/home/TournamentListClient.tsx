"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "@/lib/data/store";
import type { Tournament } from "@/lib/data/types";
import { cn, formatThaiDate } from "@/lib/utils";
import { PublicHeader } from "@/components/PublicHeader";
import { EmptyState, ErrorState, Pill } from "@/components/ui/feedback";
import { TextInput } from "@/components/ui/form";
import { Button } from "@/components/ui/Button";
import { FilterChip } from "@/components/ui/Chip";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { useI18n } from "@/lib/i18n";
import {
  groupForHome,
  type HomeGroups,
  type TournamentPhase,
} from "@/lib/tournament-list";
import {
  IconCalendar,
  IconChevronRight,
  IconList,
  IconPin,
  IconStone,
} from "@/components/icons";
import {
  TournamentCalendar,
  type CalendarEntry,
} from "@/components/home/TournamentCalendar";

type PhaseFilter = "all" | "open" | "upcoming" | "finished";
type ViewMode = "list" | "calendar";

const VIEW_KEY = "tesuji.home.view";
const PHASE_KEY = "tesuji.home.phase";

/** The home page: every visible tournament — searchable, filterable by
 *  phase, and viewable as a list (featured card + bucketed sections) or a
 *  month calendar. Tap a card → /t/[tid]. */
export default function TournamentListClient() {
  const { t } = useI18n();
  const {
    data: tournaments,
    loading,
    error,
    refetch,
  } = useLiveQuery((d) => d.listTournaments(), []);

  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<PhaseFilter>("all");
  const [view, setView] = useState<ViewMode>("list");

  // Remember view + phase across visits (restored in an effect so the server
  // render and first client paint stay identical).
  useEffect(() => {
    if (window.sessionStorage.getItem(VIEW_KEY) === "calendar") {
      setView("calendar");
    }
    const savedPhase = window.sessionStorage.getItem(PHASE_KEY);
    if (
      savedPhase === "open" ||
      savedPhase === "upcoming" ||
      savedPhase === "finished"
    ) {
      setPhase(savedPhase);
    }
  }, []);
  function pickView(v: ViewMode) {
    setView(v);
    try {
      window.sessionStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore quota */
    }
  }
  function pickPhase(p: PhaseFilter) {
    setPhase(p);
    try {
      window.sessionStorage.setItem(PHASE_KEY, p);
    } catch {
      /* ignore quota */
    }
  }
  function clearFilters() {
    setQ("");
    pickPhase("all");
  }

  const allGroups: HomeGroups = useMemo(
    () => groupForHome(tournaments ?? []),
    [tournaments],
  );
  const groups: HomeGroups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return allGroups;
    const match = (row: Tournament) =>
      row.nameTh.toLowerCase().includes(needle) ||
      (row.locationText ?? "").toLowerCase().includes(needle);
    return {
      open: allGroups.open.filter(match),
      upcoming: allGroups.upcoming.filter(match),
      finished: allGroups.finished.filter(match),
    };
  }, [allGroups, q]);

  if (loading) {
    return (
      <>
        <PublicHeader />
        <main aria-busy="true" className="mx-auto max-w-app px-4 pb-dock pt-3">
          <div className="space-y-4">
            <div className="flex items-stretch gap-2">
              <Skeleton className="h-[52px] flex-1 rounded-2xl" />
              <Skeleton className="h-[52px] w-[100px] rounded-2xl" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-10 w-24 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
              <Skeleton className="h-10 w-28 rounded-full" />
            </div>
            <div className="space-y-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        </main>
      </>
    );
  }

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

  const hasAny = (tournaments ?? []).length > 0;
  const visible: HomeGroups =
    phase === "all"
      ? groups
      : { open: [], upcoming: [], finished: [], [phase]: groups[phase] };
  const visibleCount =
    visible.open.length + visible.upcoming.length + visible.finished.length;
  const calendarEntries: CalendarEntry[] = (
    ["open", "upcoming", "finished"] as const
  ).flatMap((key) =>
    visible[key].map((tournament) => ({ tournament, phase: key })),
  );

  // The chooser's focal point: the open tournament closing soonest, shown
  // large and excluded from its section below. Only in the unfiltered list —
  // its meaning ("you can act on this now") must stay stable.
  const featured =
    view === "list" && phase === "all" && q.trim() === ""
      ? visible.open[0] ?? null
      : null;
  const openRows = featured ? visible.open.slice(1) : visible.open;

  const chips: Array<{ key: PhaseFilter; label: string; count: number }> = [
    {
      key: "all",
      label: t.home.filterAll,
      count: groups.open.length + groups.upcoming.length + groups.finished.length,
    },
    { key: "open", label: t.home.sectionOpen, count: groups.open.length },
    {
      key: "upcoming",
      label: t.home.sectionUpcoming,
      count: groups.upcoming.length,
    },
    {
      key: "finished",
      label: t.home.sectionFinished,
      count: groups.finished.length,
    },
  ];

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-app px-4 pb-dock pt-3">
        {!hasAny ? (
          <div className="pt-7">
            <EmptyState
              title={t.home.listEmptyTitle}
              description={t.home.listEmptyDesc}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search + view toggle (equal heights via items-stretch) */}
            <div className="flex items-stretch gap-2">
              <div className="flex-1">
                <TextInput
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t.home.searchPlaceholder}
                />
              </div>
              <div className="flex shrink-0 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-inset ring-white/10">
                <ViewButton
                  active={view === "list"}
                  onClick={() => pickView("list")}
                  label={t.home.viewList}
                >
                  <IconList size={18} />
                </ViewButton>
                <ViewButton
                  active={view === "calendar"}
                  onClick={() => pickView("calendar")}
                  label={t.home.viewCalendar}
                >
                  <IconCalendar size={18} />
                </ViewButton>
              </div>
            </div>

            {/* Phase filter chips */}
            <div className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {chips.map((chip) => (
                <FilterChip
                  key={chip.key}
                  active={phase === chip.key}
                  onClick={() => pickPhase(chip.key)}
                  count={chip.count}
                >
                  {chip.label}
                </FilterChip>
              ))}
            </div>

            {visibleCount === 0 ? (
              <div className="pt-4">
                <EmptyState
                  title={t.home.noMatch}
                  action={
                    <Button variant="secondary" onClick={clearFilters}>
                      {t.home.clearFilters}
                    </Button>
                  }
                />
              </div>
            ) : view === "calendar" ? (
              <TournamentCalendar entries={calendarEntries} />
            ) : (
              <div className="space-y-6">
                {featured && <FeaturedCard tournament={featured} />}
                <Section
                  title={t.home.sectionOpen}
                  phase="open"
                  rows={openRows}
                  showTitle={phase === "all"}
                />
                <Section
                  title={t.home.sectionUpcoming}
                  phase="upcoming"
                  rows={visible.upcoming}
                  showTitle={phase === "all"}
                />
                <Section
                  title={t.home.sectionFinished}
                  phase="finished"
                  rows={visible.finished}
                  showTitle={phase === "all"}
                />
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "focus-ring flex w-11 items-center justify-center self-stretch rounded-xl transition-colors",
        active
          ? "bg-brand-600 text-white"
          : "text-ink-tertiary hover:text-ink-secondary",
      )}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  phase,
  rows,
  showTitle,
}: {
  title: string;
  phase: TournamentPhase;
  rows: Tournament[];
  /** Hidden when a single-phase filter is active — the chip already says it. */
  showTitle: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      {showTitle && <SectionHeading count={rows.length}>{title}</SectionHeading>}
      <div className="space-y-3">
        {rows.map((row, i) => (
          <TournamentCard
            key={row.id}
            tournament={row}
            phase={phase}
            delayIndex={i}
          />
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

/** Media block shared by every card: the banner, or a designed fallback —
 *  brand gradient + two overlapping Go stones + a date block, so banner-less
 *  tournaments stop looking broken. */
function CardMedia({
  tournament,
  dim,
  className,
}: {
  tournament: Tournament;
  dim?: boolean;
  className?: string;
}) {
  const { locale } = useI18n();
  if (tournament.bannerUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={tournament.bannerUrl}
        alt=""
        className={cn(
          "w-full object-cover",
          dim && "opacity-60 saturate-50",
          className,
        )}
      />
    );
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(tournament.competitionDate ?? "");
  const date = m ? new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`) : null;
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-gradient-to-br from-brand-700/60 via-brand-900/60 to-[#06122a]",
        dim && "opacity-60 saturate-50",
        className,
      )}
    >
      <span aria-hidden="true" className="absolute -right-3 bottom-1 text-white/10">
        <IconStone size={72} />
      </span>
      <span aria-hidden="true" className="absolute bottom-8 right-10 text-black/30">
        <IconStone size={44} />
      </span>
      {date && (
        <div className="absolute bottom-3 left-4">
          <p className="text-xl font-bold leading-none text-white">
            {new Intl.DateTimeFormat(
              locale === "th" ? "th-TH" : "en-GB",
              { day: "numeric" },
            ).format(date)}
          </p>
          <p className="mt-1 text-xs font-medium text-white/70">
            {new Intl.DateTimeFormat(
              locale === "th" ? "th-TH" : "en-GB",
              { month: "long", year: "numeric" },
            ).format(date)}
          </p>
        </div>
      )}
    </div>
  );
}

/** The chooser's focal card — the open tournament closing soonest. */
function FeaturedCard({ tournament }: { tournament: Tournament }) {
  const { t, locale } = useI18n();
  return (
    <Link
      href={`/t/${tournament.id}`}
      className="focus-ring press block animate-rise-in overflow-hidden rounded-3xl border border-brand-400/25"
    >
      <div className="relative">
        <CardMedia tournament={tournament} className="h-40" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-300">
            {t.home.featuredLabel}
          </p>
          <p className="mt-1 line-clamp-2 text-lg font-bold text-white text-balance">
            {tournament.nameTh}
          </p>
          <div className="mt-2 flex items-center gap-2.5">
            <Pill tone="good">{t.home.pillOpen}</Pill>
            <span className="text-sm text-white/85">
              {t.home.closesOn(
                formatThaiDate(tournament.registrationClosesAt, locale),
              )}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function TournamentCard({
  tournament,
  phase,
  delayIndex = 0,
}: {
  tournament: Tournament;
  phase: TournamentPhase;
  delayIndex?: number;
}) {
  const { locale } = useI18n();
  const dim = phase === "finished";
  return (
    <Link
      href={`/t/${tournament.id}`}
      className="focus-ring press block animate-rise-in overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] transition-colors hover:bg-white/[0.06]"
      style={{ animationDelay: `${Math.min(delayIndex, 8) * 30}ms` }}
    >
      <CardMedia tournament={tournament} dim={dim} className="h-28" />
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <PhasePill phase={phase} tournament={tournament} />
          <p className="mt-1.5 line-clamp-2 font-bold text-ink">
            {tournament.nameTh}
          </p>
          <p className="mt-1 flex items-center gap-3 text-sm text-ink-tertiary">
            <span className="inline-flex shrink-0 items-center gap-1">
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
        <span className="shrink-0 text-ink-faint">
          <IconChevronRight size={20} />
        </span>
      </div>
    </Link>
  );
}
