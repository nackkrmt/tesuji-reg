// May this person enter this รุ่น? — the one client-side answer, shared by the
// register funnel, the seat swap and the division change. Mirrored by the SQL
// gates in reserve_seats / swap_seat / request_division_change, which re-check
// authoritatively against the DB-read person. Drift between the two shows up as
// a division the picker offered being rejected with RANK_NOT_ELIGIBLE /
// AGE_NOT_ELIGIBLE only after the player has filled in the whole form, so the
// rule lives here rather than being restated per call site.

import { Category, Person } from "@/lib/data/types";
import { isRankEligible } from "@/lib/rank";
import { ageFromDob, isAgeEligible } from "@/lib/age";

/** Rank AND age must both pass; each band is open when both its bounds are null.
 *  Age is reckoned as of now (the registration date), matching ageFromDob. */
export function eligibleFor(person: Person, c: Category): boolean {
  return (
    isRankEligible(person.powerLevel, c.minPowerLevel, c.maxPowerLevel) &&
    isAgeEligible(ageFromDob(person.dob), c.minAge, c.maxAge)
  );
}
