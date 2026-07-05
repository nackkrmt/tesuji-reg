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
  if (now < Date.parse(t.registrationOpensAt)) return "before";
  if (now >= Date.parse(t.registrationClosesAt)) return "closed";
  return "open";
}
