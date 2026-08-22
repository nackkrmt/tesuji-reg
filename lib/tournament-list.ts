import type { Tournament } from "@/lib/data/types";
import { regWindow } from "@/lib/tournament-window";

/** Where a tournament sits on the public home list. Drafts are hidden;
 *  "upcoming" covers both not-yet-open registration and reg-closed events
 *  whose competition day hasn't passed (they still appear as future events). */
export type TournamentPhase = "open" | "upcoming" | "finished" | "hidden";

/** competitionDate is date-only ISO for current rows, but legacy rows may hold
 *  free text — treat unparseable values as unknown. */
function competitionDayEnd(t: Pick<Tournament, "competitionDate">): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t.competitionDate ?? "");
  if (!m) return null;
  const ts = Date.parse(`${m[1]}-${m[2]}-${m[3]}T23:59:59+07:00`);
  return Number.isNaN(ts) ? null : ts;
}

export function tournamentPhase(t: Tournament, now = Date.now()): TournamentPhase {
  if (t.status === "draft") return "hidden";
  const w = regWindow(t);
  if (w === "open") return "open";
  if (w === "before") return "upcoming";
  // Registration closed (by time or by status) — the event itself may still lie
  // ahead; keep it visible as upcoming until its competition day has passed.
  const dayEnd = competitionDayEnd(t);
  if (dayEnd !== null) return dayEnd >= now ? "upcoming" : "finished";
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
 *  open → closing soonest first; upcoming → happening/opening soonest first;
 *  finished → most recent competition first. */
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
    competitionDayEnd(t) ??
    parseTs(t.registrationOpensAt) ??
    Number.MAX_SAFE_INTEGER;
  const finishedKey = (t: Tournament) =>
    competitionDayEnd(t) ?? parseTs(t.updatedAt) ?? 0;
  groups.open.sort(
    (a, b) =>
      (parseTs(a.registrationClosesAt) ?? Number.MAX_SAFE_INTEGER) -
      (parseTs(b.registrationClosesAt) ?? Number.MAX_SAFE_INTEGER),
  );
  groups.upcoming.sort((a, b) => upcomingKey(a) - upcomingKey(b));
  groups.finished.sort((a, b) => finishedKey(b) - finishedKey(a));
  return groups;
}
