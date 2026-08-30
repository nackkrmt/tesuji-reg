import { describe, expect, it } from "vitest";
import { ageBandLabel, ageFromDob, isAgeEligible } from "@/lib/age";

// Local-time constructor throughout: ageFromDob reads y/m/d parts directly to
// dodge the UTC-midnight shift that `new Date("2000-01-01")` causes in
// negative-offset timezones, and the tests must exercise that same path.
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("ageFromDob", () => {
  it("counts completed years", () => {
    expect(ageFromDob("2000-06-15", on(2026, 8, 30))).toBe(26);
  });

  it("turns over exactly on the birthday, not before", () => {
    expect(ageFromDob("2014-08-30", on(2026, 8, 29))).toBe(11);
    expect(ageFromDob("2014-08-30", on(2026, 8, 30))).toBe(12);
    expect(ageFromDob("2014-08-30", on(2026, 8, 31))).toBe(12);
  });

  it("handles a birthday later in the same month", () => {
    expect(ageFromDob("2014-08-31", on(2026, 8, 30))).toBe(11);
  });

  it("handles a birthday in a later month", () => {
    expect(ageFromDob("2014-12-01", on(2026, 8, 30))).toBe(11);
  });

  it("handles a 29 February birthday", () => {
    expect(ageFromDob("2016-02-29", on(2026, 2, 28))).toBe(9);
    expect(ageFromDob("2016-02-29", on(2026, 3, 1))).toBe(10);
  });

  it("reads the date parts literally, with no timezone shift", () => {
    // A UTC-parsed "2000-01-01" lands on 1999-12-31 in a negative-offset zone,
    // which would report 19 here instead of 20.
    expect(ageFromDob("2000-01-01", on(2020, 1, 1))).toBe(20);
  });

  it("ignores a time component", () => {
    expect(ageFromDob("2000-06-15T10:30:00Z", on(2026, 8, 30))).toBe(26);
  });

  it("returns null for empty, malformed or out-of-range input", () => {
    expect(ageFromDob("")).toBeNull();
    expect(ageFromDob("not-a-date")).toBeNull();
    expect(ageFromDob("15-06-2000")).toBeNull();
    expect(ageFromDob("2000-13-01")).toBeNull();
    expect(ageFromDob("2000-06-32")).toBeNull();
    expect(ageFromDob("2000-00-10")).toBeNull();
  });

  it("returns null for a future date of birth", () => {
    expect(ageFromDob("2030-01-01", on(2026, 8, 30))).toBeNull();
  });

  it("returns 0 for an infant rather than null", () => {
    expect(ageFromDob("2026-01-05", on(2026, 8, 30))).toBe(0);
  });
});

describe("isAgeEligible", () => {
  it("admits anyone when the band is open", () => {
    expect(isAgeEligible(9, null, null)).toBe(true);
    expect(isAgeEligible(null, null, null)).toBe(true);
    expect(isAgeEligible(undefined, undefined, undefined)).toBe(true);
  });

  it("rejects an unknown age against any bounded band", () => {
    expect(isAgeEligible(null, null, 12)).toBe(false);
    expect(isAgeEligible(null, 50, null)).toBe(false);
    expect(isAgeEligible(undefined, 8, 12)).toBe(false);
  });

  it("includes both boundaries", () => {
    expect(isAgeEligible(8, 8, 12)).toBe(true);
    expect(isAgeEligible(12, 8, 12)).toBe(true);
    expect(isAgeEligible(7, 8, 12)).toBe(false);
    expect(isAgeEligible(13, 8, 12)).toBe(false);
  });

  it("handles one-sided bands", () => {
    expect(isAgeEligible(12, null, 12)).toBe(true);
    expect(isAgeEligible(13, null, 12)).toBe(false);
    expect(isAgeEligible(50, 50, null)).toBe(true);
    expect(isAgeEligible(49, 50, null)).toBe(false);
  });
});

describe("ageBandLabel", () => {
  it("describes a two-sided band", () => {
    expect(ageBandLabel(8, 12)).toBe("อายุ 8–12 ปี");
    expect(ageBandLabel(8, 12, "en")).toBe("Age 8–12");
  });

  it("collapses an equal-bound band to a single age", () => {
    expect(ageBandLabel(10, 10)).toBe("อายุ 10 ปี");
    expect(ageBandLabel(10, 10, "en")).toBe("Age 10");
  });

  it("describes one-sided bands", () => {
    expect(ageBandLabel(null, 12)).toBe("ไม่เกิน 12 ปี");
    expect(ageBandLabel(null, 12, "en")).toBe("Up to age 12");
    expect(ageBandLabel(50, null)).toBe("50 ปีขึ้นไป");
    expect(ageBandLabel(50, null, "en")).toBe("Age 50+");
  });

  it("is empty when there is no age limit", () => {
    expect(ageBandLabel(null, null)).toBe("");
    expect(ageBandLabel(null, null, "en")).toBe("");
  });
});
