// "ปิดรอบ" — a judge's explicit "this division's round is over" signal.
//
// Why it exists: the person running MacMahon had to walk the venue to find out
// whether a round had finished, and the board could not tell them. "Every
// table has a result" is not that signal either: in round 1, which is paired
// the night before from the registration list, the tables of players who never
// came stay '?-?' for good (2026-09-26: 78 of 142 tables). Only a judge
// standing at the tables knows that the round is over, so a judge says so.
//
// Storage: one live_config row per division, key `round_closed:<divisionId>`,
// written through the existing live_set_config RPC (token- or admin-gated per
// tournament) by PUT /api/divisions/:id/close. Reopening writes the same key
// with an empty round. No migration: live_config already holds arbitrary keys.
//
// The value is a snapshot taken by the SERVER at close time (who, when, which
// tables had no result, and every table's result), so /admin/live can tell the
// MacMahon operator about a result that changed after the round was closed.
// The public snapshot carries only { round, at } — never the judge's name —
// for the same reason it leaves submittedBy out.

export const ROUND_CLOSED_PREFIX = "round_closed:";

/** 409 code from PUT /api/divisions/:id/close when the round is no longer the
 *  division's current one (MacMahon uploaded the next round meanwhile). */
export const ROUND_NOT_CURRENT = "ROUND_NOT_CURRENT";

export function roundClosedKey(divisionId: string): string {
  return ROUND_CLOSED_PREFIX + divisionId;
}

/** The division a live_config key belongs to, or null for any other key. */
export function divisionOfRoundClosedKey(key: string): string | null {
  return key.startsWith(ROUND_CLOSED_PREFIX) && key.length > ROUND_CLOSED_PREFIX.length
    ? key.slice(ROUND_CLOSED_PREFIX.length)
    : null;
}

export interface RoundClosure {
  /** The round that is closed. */
  round: string;
  /** Server time of the close, ISO 8601. */
  at: string;
  /** The judge's display name (profile.first_name_th). Self-asserted, like submittedBy. */
  by: string;
  /** Tables of that round that had no result at close time. */
  pending: string[];
  /** Every table's result at close time, table → result code. */
  results: Record<string, string>;
}

/** What the public snapshot carries per division. */
export interface PublicRoundClosure {
  round: string;
  at: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** A stored live_config value → the closure it records, or null when the round
 *  was reopened (empty round) or the value is not a closure at all. Lenient
 *  about the optional parts: a row missing `results` still says the round is
 *  closed. */
export function parseRoundClosure(value: unknown): RoundClosure | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const round = str(v.round).trim();
  if (!round) return null;
  const pending = Array.isArray(v.pending) ? v.pending.filter((t): t is string => typeof t === "string") : [];
  const results: Record<string, string> = {};
  if (v.results && typeof v.results === "object" && !Array.isArray(v.results)) {
    for (const [table, result] of Object.entries(v.results as Record<string, unknown>)) {
      if (typeof result === "string") results[table] = result;
    }
  }
  return { round, at: str(v.at), by: str(v.by), pending, results };
}

/** live_config rows of one tournament → closures by division id. Rows for other
 *  keys, reopened rounds and malformed values are skipped. */
export function closuresFromConfigRows(
  rows: readonly { key: string; value: unknown }[],
): Record<string, RoundClosure> {
  const out: Record<string, RoundClosure> = {};
  for (const row of rows) {
    const divisionId = divisionOfRoundClosedKey(row.key);
    if (!divisionId) continue;
    const closure = parseRoundClosure(row.value);
    if (closure) out[divisionId] = closure;
  }
  return out;
}

/** The public part of each closure, limited to the divisions on this board. */
export function publicClosures(
  closures: Record<string, RoundClosure>,
  divisionIds: readonly string[],
): Record<string, PublicRoundClosure> {
  const out: Record<string, PublicRoundClosure> = {};
  for (const id of divisionIds) {
    const c = closures[id];
    if (c) out[id] = { round: c.round, at: c.at };
  }
  return out;
}

const RESULT_PENDING = "?-?";

/** The value to store when a judge closes `round`, built from that round's
 *  rows as the server sees them right now. Tables sort numerically. */
export function buildClosure(
  round: string,
  rows: readonly { table: string; result: string }[],
  by: string,
  at: string,
): RoundClosure {
  const sorted = [...rows].sort((a, b) => compareTables(a.table, b.table));
  const results: Record<string, string> = {};
  const pending: string[] = [];
  for (const r of sorted) {
    const result = r.result || RESULT_PENDING;
    results[r.table] = result;
    if (result === RESULT_PENDING) pending.push(r.table);
  }
  return { round, at, by, pending, results };
}

/** Tables of the closed round whose result is not what it was at close time:
 *  a result entered, cancelled or flipped afterwards, or a table that appeared
 *  since. A table that disappeared (re-upload) is not reported — the round on
 *  the board is then a different one and the caller should look at that. */
export function tablesChangedSinceClose(
  closure: RoundClosure,
  currentRows: readonly { table: string; result: string }[],
): string[] {
  const changed: string[] = [];
  for (const r of currentRows) {
    const before = closure.results[r.table];
    const now = r.result || RESULT_PENDING;
    if (before === undefined || before !== now) changed.push(r.table);
  }
  return changed.sort(compareTables);
}

/** Numeric table order with a string fallback, like the board's. */
export function compareTables(a: string, b: string): number {
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}
