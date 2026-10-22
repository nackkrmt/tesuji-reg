import { afterEach, describe, expect, it, vi } from "vitest";
import {
  featuredForHome,
  groupForHome,
  isCompetitionDay,
  tournamentPhase,
} from "@/lib/tournament-list";
import type { Tournament } from "@/lib/data/types";

// isCompetitionDay decides whether opening /t/[tid] takes someone to the
// pairing board instead of the tournament's own page. The cost of a wrong
// boundary is asymmetric: a day too early sends a registrant to an empty board
// on the day they came to read the venue, and a day too late leaves everyone
// at the venue tapping through to a page they did not want. The +07:00
// boundaries are therefore pinned here with a frozen clock — the bug this
// guards against is a phone in another timezone (or a UTC server render)
// rolling the day over at the wrong instant, which never shows up locally.
//
// Since 20261021_0001 a tournament can run on several days, consecutive or
// not, and the rows saved before it carry only the single date — both shapes
// are covered below.

const row = (competitionDate: string, competitionDates?: string[]) => ({
  competitionDate,
  competitionDates,
});

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

describe("isCompetitionDay — several days", () => {
  // A league of Saturdays: 5, 12 and 26 September, nothing on the 19th.
  const league = row("2026-09-05", ["2026-09-05", "2026-09-12", "2026-09-26"]);

  it("is true on every listed day, not just the first", () => {
    at("2026-09-12T02:30:00.000Z");
    expect(isCompetitionDay(league)).toBe(true);
    at("2026-09-26T02:30:00.000Z");
    expect(isCompetitionDay(league)).toBe(true);
  });

  it("is false on a skipped day in between", () => {
    at("2026-09-19T02:30:00.000Z");
    expect(isCompetitionDay(league)).toBe(false);
  });

  it("is true on the second day of a consecutive run", () => {
    at("2026-09-27T02:30:00.000Z");
    expect(isCompetitionDay(row("2026-09-26", ["2026-09-26", "2026-09-27"]))).toBe(true);
  });

  it("lets the list win over a single date that disagrees with it", () => {
    at("2026-09-01T02:30:00.000Z");
    expect(isCompetitionDay(row("2026-09-01", ["2026-09-05"]))).toBe(false);
  });
});

/** A published tournament whose registration closed on 20 September and which
 *  is played on the 26th and 27th. */
function tournament(over: Partial<Tournament> = {}): Tournament {
  return {
    id: "t1",
    nameTh: "ชิงแชมป์",
    bannerUrl: null,
    venueMapUrl: null,
    competitionDate: "2026-09-26",
    competitionDates: ["2026-09-26", "2026-09-27"],
    locationText: "",
    locationMapsUrl: "",
    registrationOpensAt: "2026-08-01T00:00:00+07:00",
    registrationClosesAt: "2026-09-20T23:59:00+07:00",
    scheduleGroups: [],
    rulesSections: [],
    promptpayTargetType: "merchant_qr",
    promptpayTargetValue: "",
    status: "published",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    ...over,
  };
}

describe("tournamentPhase", () => {
  it("stays upcoming until the LAST day is over", () => {
    at("2026-09-27T05:00:00.000Z"); // noon on day two
    expect(tournamentPhase(tournament())).toBe("upcoming");
    at("2026-09-27T17:00:00.000Z"); // midnight after day two, Bangkok
    expect(tournamentPhase(tournament())).toBe("finished");
  });

  it("ends with the single day of a row saved before the migration", () => {
    at("2026-09-27T05:00:00.000Z");
    expect(tournamentPhase(tournament({ competitionDates: [] }))).toBe("finished");
  });
});

describe("groupForHome", () => {
  // A plays 5–6 September; B plays the 3rd and the 10th. Registration for both
  // closed in August, so only the competition days decide the order.
  const closed = { registrationClosesAt: "2026-08-31T23:59:00+07:00" };
  const a = tournament({
    ...closed,
    id: "a",
    competitionDate: "2026-09-05",
    competitionDates: ["2026-09-05", "2026-09-06"],
  });
  const b = tournament({
    ...closed,
    id: "b",
    competitionDate: "2026-09-03",
    competitionDates: ["2026-09-03", "2026-09-10"],
  });

  it("orders upcoming events by their first day", () => {
    at("2026-09-01T05:00:00.000Z");
    expect(groupForHome([a, b]).upcoming.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("orders finished events by their last day, most recent first", () => {
    at("2026-10-01T05:00:00.000Z");
    expect(groupForHome([a, b]).finished.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("featuredForHome", () => {
  // tournament() plays 26–27 September. Bangkok midnight on the 23rd is
  // 2026-09-22T17:00Z — the first instant it is three days out.
  const ids = () => featuredForHome([tournament()]).map((f) => f.daysUntil);

  it("starts three Bangkok days ahead, not four", () => {
    at("2026-09-22T16:59:59.000Z"); // 23:59:59 on the 22nd, Bangkok
    expect(ids()).toEqual([]);
    at("2026-09-22T17:00:00.000Z"); // midnight on the 23rd
    expect(ids()).toEqual([3]);
    at("2026-09-25T16:00:00.000Z"); // 23:00 on the 25th
    expect(ids()).toEqual([1]);
  });

  it("is today on every competition day, then drops off", () => {
    at("2026-09-26T05:00:00.000Z");
    expect(featuredForHome([tournament()])).toMatchObject([{ daysUntil: 0, day: 1, dayCount: 2 }]);
    at("2026-09-27T05:00:00.000Z");
    expect(featuredForHome([tournament()])).toMatchObject([{ daysUntil: 0, day: 2, dayCount: 2 }]);
    at("2026-09-27T17:00:00.000Z"); // midnight after the last day
    expect(ids()).toEqual([]);
  });

  it("features each day of a league in its own run-up only", () => {
    const league = tournament({
      competitionDate: "2026-09-05",
      competitionDates: ["2026-09-05", "2026-09-19"],
    });
    at("2026-09-08T05:00:00.000Z"); // eleven days before the 19th
    expect(featuredForHome([league])).toEqual([]);
    at("2026-09-17T05:00:00.000Z");
    expect(featuredForHome([league])).toMatchObject([{ daysUntil: 2, day: 2 }]);
  });

  it("skips drafts and free-text dates, and puts today first", () => {
    at("2026-09-24T05:00:00.000Z");
    const soon = tournament({ id: "soon" });
    const live = tournament({ id: "live", competitionDate: "2026-09-24", competitionDates: [] });
    const draft = tournament({ id: "draft", status: "draft" });
    const vague = tournament({ id: "vague", competitionDate: "ปลายเดือนกันยายน", competitionDates: [] });
    expect(featuredForHome([soon, draft, vague, live]).map((f) => f.tournament.id)).toEqual([
      "live",
      "soon",
    ]);
  });
});
