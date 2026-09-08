import type { RosterRegistration } from "@/lib/data/types";

/**
 * Pure helpers over `listMyRosterRegistrations()` rows. Kept out of the data
 * layer so both roster surfaces (the account roster and register step A) derive
 * their badges and filters from the same code, and so the logic is testable
 * without a backend.
 */

/** Group rows by the roster row they matched (profile id / managed player id).
 *  Input order is preserved within each group. */
export function rosterRegistrationIndex(
  rows: readonly RosterRegistration[],
): Map<string, RosterRegistration[]> {
  const byRoster = new Map<string, RosterRegistration[]>();
  for (const row of rows) {
    const bucket = byRoster.get(row.rosterId);
    if (bucket) bucket.push(row);
    else byRoster.set(row.rosterId, [row]);
  }
  return byRoster;
}

/** Who entered this person: `own` = every seat is the caller's own batch,
 *  `other` = every seat belongs to another account, `mixed` = both, `null` =
 *  not entered at all. Drives which badge the card shows. */
export function rosterRegistrationSource(
  rows: readonly RosterRegistration[] | undefined,
): "own" | "other" | "mixed" | null {
  if (!rows || rows.length === 0) return null;
  let own = false;
  let other = false;
  for (const row of rows) {
    if (row.byMe) own = true;
    else other = true;
    if (own && other) return "mixed";
  }
  return own ? "own" : "other";
}
