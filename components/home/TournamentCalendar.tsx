"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Tournament } from "@/lib/data/types";
import { useI18n } from "@/lib/i18n";
import type { TournamentPhase } from "@/lib/tournament-list";
import { IconChevronLeft, IconChevronRight } from "@/components/icons";
import { TournamentCard } from "@/components/home/TournamentListClient";

export interface CalendarEntry {
  tournament: Tournament;
  phase: TournamentPhase;
}

const DOT_TONE: Record<TournamentPhase, string> = {
  open: "bg-emerald-400",
  upcoming: "bg-amber-300",
  finished: "bg-white/35",
  hidden: "bg-white/35", // never rendered — entries are pre-filtered
};

function dayKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Month calendar over the tournament list: dotted days carry events (dot
 *  color = phase), tap one to see its tournaments. Legacy rows whose
 *  competitionDate isn't a real date can't be placed and simply don't appear
 *  here (the list view still shows them). */
export function TournamentCalendar({ entries }: { entries: CalendarEntry[] }) {
  const { t, locale } = useI18n();
  const today = new Date();
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const e of entries) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.tournament.competitionDate ?? "");
      if (!m) continue;
      const key = `${m[1]}-${m[2]}-${m[3]}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [entries]);

  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [selected, setSelected] = useState<string | null>(() =>
    byDay.has(todayKey) ? todayKey : null,
  );

  const monthLabel = new Intl.DateTimeFormat(
    locale === "th" ? "th-TH" : "en-GB",
    { month: "long", year: "numeric" },
  ).format(new Date(cursor.year, cursor.month, 1));

  function shiftMonth(delta: number) {
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay(); // 0 = Sunday
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedEntries = selected ? byDay.get(selected) ?? [] : [];
  const isCurrentMonth =
    cursor.year === today.getFullYear() && cursor.month === today.getMonth();

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-3xl p-4">
        {/* Month header */}
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label={t.home.calPrevMonth}
            className="rounded-xl p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <IconChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <p className="font-bold text-white">{monthLabel}</p>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={() => {
                  setCursor({ year: today.getFullYear(), month: today.getMonth() });
                }}
                className="rounded-full bg-white/[0.08] px-2.5 py-0.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.14] hover:text-white"
              >
                {t.home.calToday}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label={t.home.calNextMonth}
            className="rounded-xl p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <IconChevronRight size={20} />
          </button>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-white/40">
          {t.home.calWeekdays.map((w) => (
            <span key={w} className="py-1">
              {w}
            </span>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return <span key={`pad-${i}`} />;
            const key = dayKey(cursor.year, cursor.month, day);
            const events = byDay.get(key) ?? [];
            const hasEvents = events.length > 0;
            const isToday = key === todayKey;
            const isSelected = key === selected;
            return (
              <button
                key={key}
                type="button"
                disabled={!hasEvents}
                onClick={() => setSelected(isSelected ? null : key)}
                aria-pressed={isSelected}
                className={cn(
                  "mx-auto my-0.5 flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-2xl text-sm transition-colors",
                  isSelected
                    ? "bg-brand-600 font-bold text-white"
                    : hasEvents
                      ? "bg-white/[0.06] font-semibold text-white/90 hover:bg-white/[0.12]"
                      : "text-white/40",
                  isToday && !isSelected && "ring-1 ring-inset ring-brand-400/60",
                )}
              >
                {day}
                <span className="flex h-1.5 gap-0.5">
                  {events.slice(0, 3).map((e, di) => (
                    <span
                      key={di}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        isSelected ? "bg-white/90" : DOT_TONE[e.phase],
                      )}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <div className="space-y-3">
          {selectedEntries.map((e) => (
            <TournamentCard
              key={e.tournament.id}
              tournament={e.tournament}
              phase={e.phase}
            />
          ))}
        </div>
      ) : (
        <p className="text-center text-sm text-white/40">{t.home.calPickHint}</p>
      )}
    </div>
  );
}
