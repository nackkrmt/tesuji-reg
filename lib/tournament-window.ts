import type { TournamentStatus } from "@/lib/data/types";

export type RegWindowState = "not_published" | "before" | "open" | "closed";

/** Where a tournament sits relative to its registration window right now.
 *  Takes a narrow shape (not the full Tournament) so callers with in-progress
 *  form values — not yet saved — can compute the same window. */
export function regWindow(t: {
  status: TournamentStatus;
  registrationOpensAt: string;
  registrationClosesAt: string;
}): RegWindowState {
  if (t.status !== "published") return "not_published";
  const now = Date.now();
  const opens = Date.parse(t.registrationOpensAt);
  const closes = Date.parse(t.registrationClosesAt);

  // An unparseable date must never read as "open". Both comparisons below are
  // false for NaN, so a blank or malformed value used to fall through to the
  // final `return "open"` — a published tournament with a missing close date
  // invited registrations that reserve_seats would then refuse, and this
  // function is documented to accept half-filled admin form values, where a
  // date is empty for as long as it takes to type one.
  if (Number.isNaN(closes)) return "closed"; // fail closed, not open
  if (Number.isNaN(opens)) return "not_published";

  if (now < opens) return "before";
  if (now >= closes) return "closed";
  return "open";
}

/** Like regWindow, but an admin-closed tournament reads as "closed" instead of
 *  "not_published" — for user-facing copy, where "ยังไม่เปิดรับสมัคร" on an
 *  ended event would be wrong. (Drafts still map to "not_published"; the
 *  public UI never shows drafts.) */
export function effectiveRegWindow(t: {
  status: TournamentStatus;
  registrationOpensAt: string;
  registrationClosesAt: string;
}): RegWindowState {
  if (t.status === "closed") return "closed";
  return regWindow(t);
}
