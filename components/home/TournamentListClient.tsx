"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "@/lib/data/store";
import type { Tournament } from "@/lib/data/types";
import { cn, formatThaiDate } from "@/lib/utils";
import { PublicHeader } from "@/components/PublicHeader";
import {
  CenterLoader,
  EmptyState,
  ErrorState,
  Pill,
} from "@/components/ui/feedback";
import { TextInput } from "@/components/ui/form";
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

/** The home page: every visible tournament — searchable, filterable by
 *  phase, and viewable as a list (bucketed เปิดรับสมัคร → กำลังจะมาถึง →
 *  ที่ผ่านมา) or a month calendar. Tap a card → /t/[tid]. */
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

  // Remember the chosen view across visits (restored in an effect so the
  // server render and first client paint stay identical).
  useEffect(() => {
    if (window.sessionStorage.getItem(VIEW_KEY) === "calendar") {
      setView("calendar");
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

  const groups: HomeGroups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (tournaments ?? []).filter(
      (row) =>
        !needle ||
        row.nameTh.toLowerCase().includes(needle) ||
        (row.locationText ?? "").toLowerCase().includes(needle),
    );
    return groupForHome(rows);
  }, [tournaments, q]);

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

  const chips: Array<{ key: PhaseFilter; label: string }> = [
    { key: "all", label: t.home.filterAll },
    { key: "open", label: t.home.sectionOpen },
    { key: "upcoming", label: t.home.sectionUpcoming },
    { key: "finished", label: t.home.sectionFinished },
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
            {/* Search + view toggle */}
            <div className="flex items-center gap-2">
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
              {chips.map((chip) => {
                const active = phase === chip.key;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setPhase(chip.key)}
                    aria-pressed={active}
                    className={cn(
                      "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-600 text-white"
                        : "bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white/85",
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            {visibleCount === 0 ? (
              <p className="py-8 text-center text-sm text-white/45">
                {t.home.noMatch}
              </p>
            ) : view === "calendar" ? (
              <TournamentCalendar entries={calendarEntries} />
            ) : (
              <div className="space-y-6">
                <Section
                  title={t.home.sectionOpen}
                  phase="open"
                  rows={visible.open}
                />
                <Section
                  title={t.home.sectionUpcoming}
                  phase="upcoming"
                  rows={visible.upcoming}
                />
                <Section
                  title={t.home.sectionFinished}
                  phase="finished"
                  rows={visible.finished}
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
        "flex h-9 w-10 items-center justify-center rounded-xl transition-colors",
        active
          ? "bg-brand-600 text-white"
          : "text-white/50 hover:text-white/85",
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

export function TournamentCard({
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
