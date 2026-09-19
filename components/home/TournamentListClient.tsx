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
import { Skeleton, SkeletonTournamentRow } from "@/components/ui/Skeleton";
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
 *  phase, and viewable as a bucketed list or a month calendar.
 *  Tap a row → /t/[tid]. */
export default function TournamentListClient() {
  const { t } = useI18n();
  const {
    data: tournaments,
    loading,
    error,
    refetch,
  } = useLiveQuery((d) => d.listTournaments(), []);

  const [q, setQ] = useState("");
  // null = nobody has chosen yet, so the landing filter is derived from the
  // data below rather than fixed here.
  const [phase, setPhase] = useState<PhaseFilter | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  // Remember view + phase across visits (restored in an effect so the server
  // render and first client paint stay identical).
  useEffect(() => {
    if (window.sessionStorage.getItem(VIEW_KEY) === "calendar") {
      setView("calendar");
    }
    const savedPhase = window.sessionStorage.getItem(PHASE_KEY);
    if (
      savedPhase === "all" ||
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
  // The chooser opens on "เปิดรับสมัคร" — what a visitor can act on today —
  // and only falls back to "ทั้งหมด" when nothing is open, so the page never
  // lands on its own empty state. A chip tap (or the last visit's) wins over
  // both; the fallback is read off the unfiltered groups, so typing in the
  // search box can never move the filter out from under the visitor.
  const effectivePhase: PhaseFilter =
    phase ?? (allGroups.open.length > 0 ? "open" : "all");

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
            <div className="space-y-2">
              <SkeletonTournamentRow />
              <SkeletonTournamentRow />
              <SkeletonTournamentRow />
              <SkeletonTournamentRow />
              <SkeletonTournamentRow />
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
    effectivePhase === "all"
      ? groups
      : {
          open: [],
          upcoming: [],
          finished: [],
          [effectivePhase]: groups[effectivePhase],
        };
  const visibleCount =
    visible.open.length + visible.upcoming.length + visible.finished.length;
  const calendarEntries: CalendarEntry[] = (
    ["open", "upcoming", "finished"] as const
  ).flatMap((key) =>
    visible[key].map((tournament) => ({ tournament, phase: key })),
  );

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
        {/* The chooser opens on its search box — there is no visible page
            title to promote, so the heading exists for screen-reader and
            search-result navigation only. Without it this page's tree started
            at the section h2s. */}
        <h1 className="sr-only">{t.home.pageHeading}</h1>
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
                  active={effectivePhase === chip.key}
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
                <Section
                  title={t.home.sectionOpen}
                  phase="open"
                  rows={visible.open}
                  showTitle={effectivePhase === "all"}
                />
                <Section
                  title={t.home.sectionUpcoming}
                  phase="upcoming"
                  rows={visible.upcoming}
                  showTitle={effectivePhase === "all"}
                />
                <Section
                  title={t.home.sectionFinished}
                  phase="finished"
                  rows={visible.finished}
                  showTitle={effectivePhase === "all"}
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
      <div className="space-y-2">
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
  size = "md",
}: {
  phase: TournamentPhase;
  tournament: Tournament;
  size?: "md" | "sm";
}) {
  const { t } = useI18n();
  if (phase === "open")
    return (
      <Pill tone="good" size={size}>
        {t.home.pillOpen}
      </Pill>
    );
  if (phase === "finished")
    return (
      <Pill tone="neutral" size={size}>
        {t.home.closed}
      </Pill>
    );
  // upcoming: registration not open yet vs already closed but event ahead
  return tournament.status === "published" &&
    Date.now() < Date.parse(tournament.registrationOpensAt) ? (
    <Pill tone="warn" size={size}>
      {t.home.notYetOpen}
    </Pill>
  ) : (
    <Pill tone="bad" size={size}>
      {t.home.closed}
    </Pill>
  );
}

/** Six low-saturation gradients, so a list of banner-less tournaments reads as
 *  a set of distinct tiles instead of three copies of one placeholder. Keyed by
 *  a hash of the id: stable between the server and client render (no hydration
 *  mismatch) and stable for a tournament across visits. Spelled out in full
 *  because Tailwind only keeps class names that appear literally in source. */
const TILE_GRADIENTS = [
  "from-brand-700/70 via-brand-900/70 to-[#06122a]",
  "from-indigo-500/60 via-indigo-900/70 to-[#0b0f24]",
  "from-teal-500/55 via-teal-900/70 to-[#04201f]",
  "from-violet-500/55 via-violet-900/70 to-[#140a24]",
  "from-rose-500/45 via-rose-900/65 to-[#240a12]",
  "from-amber-500/45 via-amber-900/65 to-[#231404]",
] as const;

function gradientFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_GRADIENTS[h % TILE_GRADIENTS.length];
}

/** The row's 56px tile: the banner, cropped square — or, for the tournaments
 *  that have none (which is most of them), a goban corner: three lines each
 *  way, a black stone and a white one on the intersections, over the tinted
 *  gradient. Drawn rather than left grey because banner-less is the common
 *  case here, and a list of grey squares reads as a list of broken images. */
function RowThumb({ tournament, dim }: { tournament: Tournament; dim: boolean }) {
  const shell = cn(
    "relative h-14 w-14 shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-white/10",
    dim && "opacity-60 saturate-50",
  );
  if (tournament.bannerUrl) {
    return (
      <span className={shell}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={tournament.bannerUrl}
          alt=""
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(shell, "bg-gradient-to-br", gradientFor(tournament.id))}
    >
      <svg viewBox="0 0 56 56" className="h-full w-full">
        <path
          d="M14 0v56M28 0v56M42 0v56M0 14h56M0 28h56M0 42h56"
          stroke="rgba(255,255,255,0.13)"
          strokeWidth="1"
          fill="none"
        />
        <circle cx="14" cy="28" r="8.5" fill="rgba(6,9,18,0.82)" />
        {/* The glint goes on the black stone; on the white one it would be
            white on white. */}
        <ellipse cx="11.8" cy="25.4" rx="2.8" ry="1.7" fill="rgba(255,255,255,0.22)" />
        <circle cx="42" cy="42" r="8.5" fill="rgba(244,246,251,0.92)" />
      </svg>
    </span>
  );
}

/** One tournament, one row.
 *
 *  This used to be a card led by a 112px banner: three tournaments filled a
 *  phone screen and the page read as artwork rather than a list you scan. The
 *  picture is still here, cropped to a 56px tile, so the row keeps its face
 *  while costing a third of the height. The banner itself is unchanged on
 *  /t/[tid], where it has the room it was drawn for.
 *
 *  Name and phase pill share the first line, date and location the second;
 *  both truncate, so a long name or a long venue shortens its own line instead
 *  of wrapping the row taller. */
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
  // Finished tournaments fade their tile, not their text — dimming the whole
  // row would take the ink scale below its contrast floor, and the "closed"
  // pill already says the event is over.
  const dim = phase === "finished";
  return (
    <Link
      href={`/t/${tournament.id}`}
      className="focus-ring press flex animate-rise-in items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5 transition-colors hover:bg-white/[0.06]"
      style={{ animationDelay: `${Math.min(delayIndex, 8) * 30}ms` }}
    >
      <RowThumb tournament={tournament} dim={dim} />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold text-ink">
            {tournament.nameTh}
          </span>
          <PhasePill phase={phase} tournament={tournament} size="sm" />
        </span>
        <span className="flex items-center gap-3 text-sm text-ink-tertiary">
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
        </span>
      </span>

      <span className="shrink-0 text-ink-faint">
        <IconChevronRight size={18} />
      </span>
    </Link>
  );
}
