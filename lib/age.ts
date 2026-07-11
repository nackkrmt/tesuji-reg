// Age helpers — whole-year age from a yyyy-mm-dd date of birth, plus the
// division age-band eligibility test. Mirrored by SQL reserve_seats (server),
// so the client and server agree on who may register for an age-bounded รุ่น.
// Age is reckoned in completed years as of "today" (the registration date);
// the tournament's competitionDate is a date-only value used only for display.

/** Completed-year age from an ISO date of birth (yyyy-mm-dd), as of `asOf`
 *  (default: now). Returns null for an empty / unparseable / future value.
 *  The y/m/d parts are read directly rather than via `new Date(string)`:
 *  string parsing lands on UTC midnight while the accessors read local time,
 *  which shifts the date by a day in negative-UTC-offset timezones. */
export function ageFromDob(dob: string, asOf: Date = new Date()): number | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const by = Number(y);
  const bm = Number(mo);
  const bd = Number(d);
  if (bm < 1 || bm > 12 || bd < 1 || bd > 31) return null;
  let age = asOf.getFullYear() - by;
  const diff = asOf.getMonth() + 1 - bm;
  if (diff < 0 || (diff === 0 && asOf.getDate() < bd)) age -= 1;
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
 *  "50 ปีขึ้นไป". Returns "" when there is no age limit (both bounds null).
 *  Defaults to Thai so locale-agnostic callers keep the Thai text. */
export function ageBandLabel(
  min: number | null | undefined,
  max: number | null | undefined,
  locale: "th" | "en" = "th",
): string {
  const en = locale === "en";
  if (min == null && max == null) return "";
  if (min != null && max != null) {
    return min === max
      ? en
        ? `Age ${min}`
        : `อายุ ${min} ปี`
      : en
        ? `Age ${min}–${max}`
        : `อายุ ${min}–${max} ปี`;
  }
  if (max != null) return en ? `Up to age ${max}` : `ไม่เกิน ${max} ปี`;
  return en ? `Age ${min}+` : `${min} ปีขึ้นไป`;
}
