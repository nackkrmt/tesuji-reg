import { afterEach, describe, expect, it, vi } from "vitest";
import { isCompetitionDay } from "@/lib/tournament-list";

// isCompetitionDay decides whether opening /t/[tid] takes someone to the
// pairing board instead of the tournament's own page. The cost of a wrong
// boundary is asymmetric: a day too early sends a registrant to an empty board
// on the day they came to read the venue, and a day too late leaves everyone
// at the venue tapping through to a page they did not want. The +07:00
// boundaries are therefore pinned here with a frozen clock — the bug this
// guards against is a phone in another timezone (or a UTC server render)
// rolling the day over at the wrong instant, which never shows up locally.

const row = (competitionDate: string) => ({ competitionDate });

/** Freeze the clock at an instant expressed in UTC. */
function at(utcIso: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(utcIso));
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isCompetitionDay", () => {
  // 2026-09-26 in Bangkok runs 2026-09-25T17:00Z → 2026-09-26T16:59:59Z.
  const DAY = "2026-09-26";

  it("is false a second before the Bangkok day starts", () => {
    at("2026-09-25T16:59:59.000Z");
    expect(isCompetitionDay(row(DAY))).toBe(false);
  });

  it("is true from Bangkok midnight", () => {
    at("2026-09-25T17:00:00.000Z");
    expect(isCompetitionDay(row(DAY))).toBe(true);
  });

  it("is true through the competition day", () => {
    at("2026-09-26T02:30:00.000Z"); // 09:30 in Bangkok
    expect(isCompetitionDay(row(DAY))).toBe(true);
  });

  it("is true at the last second of the Bangkok day", () => {
    at("2026-09-26T16:59:59.000Z");
    expect(isCompetitionDay(row(DAY))).toBe(true);
  });

  it("is false once the Bangkok day has ended", () => {
    at("2026-09-26T17:00:00.000Z");
    expect(isCompetitionDay(row(DAY))).toBe(false);
  });

  it("is false for a legacy free-text date — unknown is not today", () => {
    at("2026-09-26T02:30:00.000Z");
    expect(isCompetitionDay(row("ปลายเดือนกันยายน"))).toBe(false);
    expect(isCompetitionDay(row(""))).toBe(false);
  });

  it("reads the date part of a full ISO timestamp", () => {
    at("2026-09-26T02:30:00.000Z");
    expect(isCompetitionDay(row("2026-09-26T09:00:00+07:00"))).toBe(true);
  });

  it("takes an explicit clock", () => {
    const noon = Date.parse("2026-09-26T12:00:00+07:00");
    expect(isCompetitionDay(row(DAY), noon)).toBe(true);
    expect(isCompetitionDay(row("2026-09-27"), noon)).toBe(false);
  });
});
