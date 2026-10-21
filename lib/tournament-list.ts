import type { Tournament } from "@/lib/data/types";
import { regWindow } from "@/lib/tournament-window";
import {
  bangkokDaySpan,
  type CompetitionDateFields,
  competitionDays,
  firstDayEnd,
  lastDayEnd,
} from "@/lib/competition-dates";

/** Where a tournament sits on the public home list. Drafts are hidden;
 *  "upcoming" covers both not-yet-open registration and reg-closed events
 *  whose last competition day hasn't passed (they still appear as future
 *  events). */
export type TournamentPhase = "open" | "upcoming" | "finished" | "hidden";

/** Whether the tournament is happening today, Bangkok time — on ANY of its
 *  competition days: a weekend event is "today" on both days, a league of
 *  Saturdays on each Saturday and not in between (lib/competition-dates.ts).
 *
 *  The whole local day counts, not a start time: the days are date-only, so
 *  there is no first-round time to compare against, and people open the app
 *  on the way to the venue. Boundaries are +07:00 because that is where the
 *  tournaments are — a phone in another timezone must not roll the day over
 *  early or late.
 *
 *  Legacy free-text dates answer false. Unknown is not today, and this gates a
 *  redirect: guessing wrong would take someone somewhere they did not ask to
 *  go. */
export function isCompetitionDay(t: CompetitionDateFields, now = Date.now()): boolean {
  return competitionDays(t).some((day) => {
    const span = bangkokDaySpan(day);
    return span !== null && now >= span.start && now <= span.end;
  });
}

export function tournamentPhase(t: Tournament, now = Date.now()): TournamentPhase {
  if (t.status === "draft") return "hidden";
  const w = regWindow(t);
  if (w === "open") return "open";
  if (w === "before") return "upcoming";
  // Registration closed (by time or by status) — the event itself may still
  // lie ahead, or be part-way through a multi-day run; keep it visible as
  // upcoming until its LAST competition day has passed.
  const end = lastDayEnd(t);
  if (end !== null) return end >= now ? "upcoming" : "finished";
  // Unknown competition day (legacy free-text rows): admin-closed → finished,
  // otherwise assume the event is still ahead rather than burying it.
  return t.status === "closed" ? "finished" : "upcoming";
}

/** Everything a guest may see (drops drafts). */
export function publicTournaments(rows: Tournament[], now = Date.now()): Tournament[] {
  return rows.filter((t) => tournamentPhase(t, now) !== "hidden");
}

export interface HomeGroups {
  open: Tournament[];
  upcoming: Tournament[];
  finished: Tournament[];
}

/** Buckets + in-section ordering for the home list:
 *  open → closing soonest first; upcoming → happening/opening soonest first
 *  (by first competition day); finished → most recent competition first (by
 *  last competition day). */
export function groupForHome(rows: Tournament[], now = Date.now()): HomeGroups {
  const groups: HomeGroups = { open: [], upcoming: [], finished: [] };
  for (const t of rows) {
    const phase = tournamentPhase(t, now);
    if (phase !== "hidden") groups[phase].push(t);
  }
  // Date.parse returns NaN (never null) on junk input — normalize so unknown
  // values sort deterministically instead of poisoning the comparator.
  const parseTs = (v: string): number | null => {
    const ts = Date.parse(v);
    return Number.isNaN(ts) ? null : ts;
  };
  const upcomingKey = (t: Tournament) =>
    firstDayEnd(t) ?? parseTs(t.registrationOpensAt) ?? Number.MAX_SAFE_INTEGER;
  const finishedKey = (t: Tournament) => lastDayEnd(t) ?? parseTs(t.updatedAt) ?? 0;
  groups.open.sort(
    (a, b) =>
      (parseTs(a.registrationClosesAt) ?? Number.MAX_SAFE_INTEGER) -
      (parseTs(b.registrationClosesAt) ?? Number.MAX_SAFE_INTEGER),
  );
  groups.upcoming.sort((a, b) => upcomingKey(a) - upcomingKey(b));
  groups.finished.sort((a, b) => finishedKey(b) - finishedKey(a));
  return groups;
}
