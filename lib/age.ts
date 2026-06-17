// Age helpers — whole-year age from a yyyy-mm-dd date of birth, plus the
// division age-band eligibility test. Mirrored by SQL reserve_seats (server),
// so the client and server agree on who may register for an age-bounded รุ่น.
// Age is reckoned in completed years as of "today" (the registration date);
// the tournament's competitionDate is free text and cannot be parsed reliably.

/** Completed-year age from an ISO date of birth (yyyy-mm-dd), as of `asOf`
 *  (default: now). Returns null for an empty / unparseable / future value. */
export function ageFromDob(dob: string, asOf: Date = new Date()): number | null {
  if (!dob) return null;
  const b = new Date(dob);
  if (isNaN(b.getTime())) return null;
  let age = asOf.getFullYear() - b.getFullYear();
  const m = asOf.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && asOf.getDate() < b.getDate())) age -= 1;
  return age < 0 ? null : age;
}

/**
 * Age-band eligibility — the single source of truth, mirrored by SQL reserve_seats.
 * Open band (both null) → anyone; bounded + null age → not eligible.
 */
export function isAgeEligible(
  age: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): boolean {
  if (min == null && max == null) return true; // no age limit
  if (age == null) return false; // bounded needs a known age
  if (min != null && age < min) return false;
  if (max != null && age > max) return false;
  return true;
}

/** Human label for a division's age band, e.g. "อายุ 8–12 ปี" / "ไม่เกิน 12 ปี" /
 *  "50 ปีขึ้นไป". Returns "" when there is no age limit (both bounds null). */
export function ageBandLabel(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min == null && max == null) return "";
  if (min != null && max != null) {
    return min === max ? `อายุ ${min} ปี` : `อายุ ${min}–${max} ปี`;
  }
  if (max != null) return `ไม่เกิน ${max} ปี`;
  return `${min} ปีขึ้นไป`;
}
