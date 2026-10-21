// A tournament's competition days — one, several in a row, or several weeks of
// Saturdays. Until 20261021_0001 a tournament had exactly one `competitionDate`
// (a date-only ISO string, free text on the oldest rows); it now also carries
// `competitionDates`, every day it is played, sorted and unique. The single
// column is kept as the FIRST day so everything that orders or filters by it
// (the judge list, the rank worklists, slip retention) keeps working.
//
// Everything here is pure and timezone-pinned to Bangkok, like
// lib/tournament-list.ts: the events are in Thailand, and a phone or a server in
// another zone must not roll a competition day over at the wrong instant.
import type { Tournament } from "@/lib/data/types";

/** The two date fields, with the list optional so a caller (or a test) that
 *  only has the legacy single date can still ask. */
export type CompetitionDateFields = Pick<Tournament, "competitionDate"> &
  Partial<Pick<Tournament, "competitionDates">>;

/** The ISO day ("yyyy-mm-dd") at the front of a date-ish string, or null when
 *  it is not one — legacy free text, an empty string, a calendar-impossible
 *  value like "2026-02-30". A full timestamp keeps only its date part. */
export function isoDay(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // setUTCFullYear(y, m, d) rather than Date.UTC(y, m, d): the latter reads a
  // two-digit year as 19xx, which would make "0026-09-14" fail for the wrong
  // reason. A date that does not exist normalizes to the next month and is
  // caught by the comparison.
  const probe = new Date(0);
  probe.setUTCFullYear(y, mo - 1, d);
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Valid ISO days only, de-duplicated and ascending — the shape the column,
 *  the form and every reader agree on. */
export function normalizeCompetitionDates(values: readonly string[]): string[] {
  const out = new Set<string>();
  for (const v of values) {
    const day = isoDay(v);
    if (day) out.add(day);
  }
  return [...out].sort();
}

/** The days a tournament is played on. `competitionDates` when it has any;
 *  otherwise the legacy single `competitionDate`, which is still all that a
 *  row saved before the migration carries. Empty when neither parses (free
 *  text): unknown is not "today", and not a day on the calendar either. */
export function competitionDays(t: CompetitionDateFields): string[] {
  const many = normalizeCompetitionDates(t.competitionDates ?? []);
  if (many.length > 0) return many;
  const one = isoDay(t.competitionDate);
  return one ? [one] : [];
}

/** The ISO day after `day`. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const next = new Date(0);
  next.setUTCFullYear(y, m - 1, d + 1);
  return next.toISOString().slice(0, 10);
}

/** One ISO day as a Bangkok-local span — midnight to the last second. */
export function bangkokDaySpan(day: string): { start: number; end: number } | null {
  const iso = isoDay(day);
  if (!iso) return null;
  const start = Date.parse(`${iso}T00:00:00+07:00`);
  const end = Date.parse(`${iso}T23:59:59+07:00`);
  return Number.isNaN(start) || Number.isNaN(end) ? null : { start, end };
}

/** End of the FIRST competition day (Bangkok), or null when unknown. */
export function firstDayEnd(t: CompetitionDateFields): number | null {
  const days = competitionDays(t);
  return days.length ? (bangkokDaySpan(days[0])?.end ?? null) : null;
}

/** End of the LAST competition day (Bangkok), or null when unknown — the
 *  instant after which the event is over. */
export function lastDayEnd(t: CompetitionDateFields): number | null {
  const days = competitionDays(t);
  return days.length ? (bangkokDaySpan(days[days.length - 1])?.end ?? null) : null;
}

// ── formatting ───────────────────────────────────────────────────────────────

type Locale = "th" | "en";

interface DayParts {
  iso: string;
  day: number;
  month: string; // localized month name
  year: string; // localized year — Buddhist era for Thai
}

function dayParts(iso: string, locale: Locale): DayParts {
  // Noon Bangkok so no timezone can nudge the date; the parts carry the
  // locale's own calendar (th-TH is Buddhist), same as formatThaiDate.
  const parts = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(`${iso}T12:00:00+07:00`));
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { iso, day: Number(iso.slice(8, 10)), month: pick("month"), year: pick("year") };
}

/** Consecutive runs, each as its first and last day: 14,15,16,20 → [14–16], [20]. */
function spans(parts: DayParts[]): Array<{ from: DayParts; to: DayParts }> {
  const out: Array<{ from: DayParts; to: DayParts }> = [];
  for (const p of parts) {
    const cur = out[out.length - 1];
    if (cur && nextDay(cur.to.iso) === p.iso) cur.to = p;
    else out.push({ from: p, to: p });
  }
  return out;
}

/** "14 กันยายน 2569" · "14–16 กันยายน 2569" · "30 กันยายน – 2 ตุลาคม 2569" ·
 *  "31 ธันวาคม 2569 – 1 มกราคม 2570" — one day or one unbroken range. */
function rangeText(from: DayParts, to: DayParts): string {
  if (from.iso === to.iso) return `${from.day} ${from.month} ${from.year}`;
  if (from.month === to.month && from.year === to.year) {
    return `${from.day}–${to.day} ${from.month} ${from.year}`;
  }
  if (from.year === to.year) {
    return `${from.day} ${from.month} – ${to.day} ${to.month} ${from.year}`;
  }
  return `${from.day} ${from.month} ${from.year} – ${to.day} ${to.month} ${to.year}`;
}

function joinList(items: string[], locale: Locale): string {
  if (items.length <= 1) return items.join("");
  const and = locale === "en" ? " and " : " และ ";
  return `${items.slice(0, -1).join(", ")}${and}${items[items.length - 1]}`;
}

/** Every competition day, written the way a poster would: "14 กันยายน 2569",
 *  "14–16 กันยายน 2569", "5, 12, 19 กันยายน และ 3, 10 ตุลาคม 2569",
 *  "30 กันยายน – 2 ตุลาคม 2569". Days in one month share the month name; the
 *  year is written once when every day shares it. Empty input gives "". */
export function formatCompetitionDates(days: readonly string[], locale: Locale = "th"): string {
  const parts = normalizeCompetitionDates(days).map((d) => dayParts(d, locale));
  if (parts.length === 0) return "";
  const oneYear = parts.every((p) => p.year === parts[0].year);
  const yearOf = (p: DayParts) => (oneYear ? "" : ` ${p.year}`);

  // Same-month spans are pooled so "5, 12, 19 กันยายน" names the month once; a
  // span that crosses a month boundary is written out on its own.
  const groups: string[] = [];
  let pooled: string[] = [];
  let pooledMonth: DayParts | null = null;
  const flush = () => {
    if (pooledMonth) groups.push(`${pooled.join(", ")} ${pooledMonth.month}${yearOf(pooledMonth)}`);
    pooled = [];
    pooledMonth = null;
  };
  for (const s of spans(parts)) {
    const sameMonth = s.from.month === s.to.month && s.from.year === s.to.year;
    if (!sameMonth) {
      flush();
      groups.push(
        `${s.from.day} ${s.from.month}${yearOf(s.from)} – ${s.to.day} ${s.to.month}${yearOf(s.to)}`,
      );
      continue;
    }
    if (pooledMonth && (pooledMonth.month !== s.from.month || pooledMonth.year !== s.from.year)) {
      flush();
    }
    pooledMonth = s.from;
    pooled.push(s.from.iso === s.to.iso ? `${s.from.day}` : `${s.from.day}–${s.to.day}`);
  }
  flush();

  const text = joinList(groups, locale);
  return oneYear ? `${text} ${parts[0].year}` : text;
}

/** The compact form for list rows, where a ten-Saturday season must still fit
 *  on one line: a single day or one unbroken run reads exactly like
 *  formatCompetitionDates; anything scattered collapses to first – last with
 *  the day count, "5 กันยายน – 31 ตุลาคม 2569 (9 วัน)". */
export function formatCompetitionSpan(days: readonly string[], locale: Locale = "th"): string {
  const parts = normalizeCompetitionDates(days).map((d) => dayParts(d, locale));
  if (parts.length === 0) return "";
  const range = rangeText(parts[0], parts[parts.length - 1]);
  if (spans(parts).length === 1) return range;
  return `${range} (${parts.length} ${locale === "en" ? "days" : "วัน"})`;
}

/** What a page prints for วันที่แข่งขัน: the formatted days, or the legacy free
 *  text verbatim when that is all the row has ("ปลายเดือนกันยายน" is still
 *  information). "compact" is formatCompetitionSpan, for list rows. */
export function competitionDatesLabel(
  t: CompetitionDateFields,
  locale: Locale = "th",
  style: "full" | "compact" = "full",
): string {
  const days = competitionDays(t);
  if (days.length === 0) return t.competitionDate ?? "";
  return style === "compact"
    ? formatCompetitionSpan(days, locale)
    : formatCompetitionDates(days, locale);
}
