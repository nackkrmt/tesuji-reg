import { describe, expect, it } from "vitest";
import {
  MAX_POWER,
  MIN_POWER,
  RANKS,
  isRankEligible,
  powerToLabel,
  rankByPower,
  rankToPowerLevel,
} from "@/lib/rank";

describe("the rank ladder", () => {
  it("runs 15 kyu → 8 dan over a contiguous power range", () => {
    expect(RANKS).toHaveLength(23);
    expect(RANKS.map((r) => r.power)).toEqual(
      Array.from({ length: 23 }, (_, i) => i),
    );
    expect(RANKS[0]).toMatchObject({ power: MIN_POWER, kind: "kyu", number: 15 });
    expect(RANKS[RANKS.length - 1]).toMatchObject({
      power: MAX_POWER,
      kind: "dan",
      number: 8,
    });
  });

  it("puts every dan above every kyu", () => {
    const strongestKyu = Math.max(
      ...RANKS.filter((r) => r.kind === "kyu").map((r) => r.power),
    );
    const weakestDan = Math.min(
      ...RANKS.filter((r) => r.kind === "dan").map((r) => r.power),
    );
    expect(weakestDan).toBeGreaterThan(strongestKyu);
  });
});

describe("rankToPowerLevel", () => {
  it("parses kyu in either language", () => {
    expect(rankToPowerLevel("15 Kyu")).toBe(0);
    expect(rankToPowerLevel("1 Kyu")).toBe(14);
    expect(rankToPowerLevel("10 คิว")).toBe(5);
    expect(rankToPowerLevel("5kyu")).toBe(10);
    expect(rankToPowerLevel("  3 KYU  ")).toBe(12);
  });

  it("parses dan in either language", () => {
    expect(rankToPowerLevel("1 Dan")).toBe(15);
    expect(rankToPowerLevel("8 Dan")).toBe(22);
    expect(rankToPowerLevel("3 ดั้ง")).toBe(17);
  });

  it("clamps out-of-range numbers to the ends of the ladder", () => {
    expect(rankToPowerLevel("30 Kyu")).toBe(0); // weaker than the floor
    expect(rankToPowerLevel("0 Kyu")).toBe(14); // below 1 kyu clamps up
    expect(rankToPowerLevel("9 Dan")).toBe(22); // stronger than the ceiling
  });

  it("returns null for anything it cannot parse", () => {
    expect(rankToPowerLevel("")).toBeNull();
    expect(rankToPowerLevel("Open")).toBeNull();
    expect(rankToPowerLevel("Master")).toBeNull();
    expect(rankToPowerLevel("5")).toBeNull();
    expect(rankToPowerLevel("5 Kyu extra")).toBeNull();
  });

  it("round-trips every rank through its own English label", () => {
    for (const r of RANKS) {
      expect(rankToPowerLevel(r.en)).toBe(r.power);
      expect(rankToPowerLevel(r.th)).toBe(r.power);
    }
  });
});

describe("powerToLabel", () => {
  it("labels a known power in both locales", () => {
    expect(powerToLabel(0)).toBe("15 คิว");
    expect(powerToLabel(0, "en")).toBe("15 Kyu");
    expect(powerToLabel(22, "en")).toBe("8 Dan");
  });

  it("falls back for null and for powers off the ladder", () => {
    expect(powerToLabel(null)).toBe("ไม่ระบุระดับ");
    expect(powerToLabel(undefined, "en")).toBe("Unspecified");
    // The DB CHECK constraints still allow 0..25, so 23-25 are storable but
    // map to no rank — worth pinning so the mismatch is visible if it changes.
    expect(powerToLabel(23, "en")).toBe("Unspecified");
    expect(rankByPower(23)).toBeNull();
  });
});

describe("isRankEligible", () => {
  it("admits anyone when the band is open", () => {
    expect(isRankEligible(0, null, null)).toBe(true);
    expect(isRankEligible(null, null, null)).toBe(true);
  });

  it("rejects an undeclared rank against any bounded band", () => {
    expect(isRankEligible(null, null, 5)).toBe(false);
    expect(isRankEligible(undefined, 15, null)).toBe(false);
  });

  it("includes both boundaries", () => {
    expect(isRankEligible(5, 5, 10)).toBe(true);
    expect(isRankEligible(10, 5, 10)).toBe(true);
    expect(isRankEligible(4, 5, 10)).toBe(false);
    expect(isRankEligible(11, 5, 10)).toBe(false);
  });

  it("handles one-sided bands", () => {
    expect(isRankEligible(14, null, 14)).toBe(true); // "up to 1 kyu"
    expect(isRankEligible(15, null, 14)).toBe(false); // 1 dan is over the cap
    expect(isRankEligible(15, 15, null)).toBe(true); // "dan only"
    expect(isRankEligible(14, 15, null)).toBe(false);
  });
});
