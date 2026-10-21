import { describe, expect, it } from "vitest";
import {
  bangkokDaySpan,
  competitionDays,
  firstDayEnd,
  competitionDatesLabel,
  formatCompetitionDates,
  formatCompetitionSpan,
  isoDay,
  lastDayEnd,
  nextDay,
  normalizeCompetitionDates,
} from "@/lib/competition-dates";

// A tournament used to be one date; it is now a list of days that may skip
// days (a league played on Saturdays) and the old column is its first entry.
// The readers that matter most — "is it today", "is it over", the home list's
// ordering — all run through competitionDays, so the fallbacks are pinned here:
// a row saved before the migration has only competitionDate, and the oldest
// rows hold free text that must stay "unknown" rather than become a day.

describe("isoDay", () => {
  it("accepts a date-only ISO string and the date part of a timestamp", () => {
    expect(isoDay("2026-09-14")).toBe("2026-09-14");
    expect(isoDay("2026-09-14T09:00:00+07:00")).toBe("2026-09-14");
  });

  it("rejects free text, blanks and days that are not on the calendar", () => {
    expect(isoDay("ปลายเดือนกันยายน")).toBeNull();
    expect(isoDay("")).toBeNull();
    expect(isoDay(null)).toBeNull();
    expect(isoDay("2026-02-30")).toBeNull();
    expect(isoDay("2023-02-29")).toBeNull();
    expect(isoDay("2026-13-01")).toBeNull();
  });

  it("keeps a real leap day", () => {
    expect(isoDay("2024-02-29")).toBe("2024-02-29");
  });
});

describe("normalizeCompetitionDates", () => {
  it("sorts, de-duplicates and drops what is not a day", () => {
    expect(
      normalizeCompetitionDates(["2026-10-03", "2026-09-26", "2026-10-03", "", "junk"]),
    ).toEqual(["2026-09-26", "2026-10-03"]);
  });
});

describe("competitionDays", () => {
  it("prefers the list", () => {
    expect(
      competitionDays({ competitionDate: "2026-09-26", competitionDates: ["2026-09-27", "2026-09-26"] }),
    ).toEqual(["2026-09-26", "2026-09-27"]);
  });

  it("falls back to the single date of a row saved before the migration", () => {
    expect(competitionDays({ competitionDate: "2026-09-26" })).toEqual(["2026-09-26"]);
    expect(competitionDays({ competitionDate: "2026-09-26", competitionDates: [] })).toEqual([
      "2026-09-26",
    ]);
  });

  it("is empty for legacy free text — unknown is not a day", () => {
    expect(competitionDays({ competitionDate: "ปลายเดือนกันยายน" })).toEqual([]);
    expect(competitionDays({ competitionDate: "" })).toEqual([]);
  });
});

describe("nextDay", () => {
  it("rolls over months, years and leap days", () => {
    expect(nextDay("2026-09-30")).toBe("2026-10-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
    expect(nextDay("2024-02-28")).toBe("2024-02-29");
    expect(nextDay("2023-02-28")).toBe("2023-03-01");
  });
});

describe("bangkokDaySpan / firstDayEnd / lastDayEnd", () => {
  it("spans the Bangkok day, not the UTC one", () => {
    expect(bangkokDaySpan("2026-09-26")).toEqual({
      start: Date.parse("2026-09-25T17:00:00Z"),
      end: Date.parse("2026-09-26T16:59:59Z"),
    });
    expect(bangkokDaySpan("not a day")).toBeNull();
  });

  it("ends on the last listed day, whatever order the days arrived in", () => {
    const t = { competitionDate: "2026-09-26", competitionDates: ["2026-10-03", "2026-09-26"] };
    expect(firstDayEnd(t)).toBe(Date.parse("2026-09-26T16:59:59Z"));
    expect(lastDayEnd(t)).toBe(Date.parse("2026-10-03T16:59:59Z"));
    expect(lastDayEnd({ competitionDate: "" })).toBeNull();
  });
});

describe("formatCompetitionDates", () => {
  it("writes one day like formatThaiDate does", () => {
    expect(formatCompetitionDates(["2026-09-14"])).toBe("14 กันยายน 2569");
    expect(formatCompetitionDates(["2026-09-14"], "en")).toBe("14 September 2026");
  });

  it("collapses consecutive days into a range", () => {
    expect(formatCompetitionDates(["2026-09-14", "2026-09-15", "2026-09-16"])).toBe(
      "14–16 กันยายน 2569",
    );
    expect(formatCompetitionDates(["2026-09-16", "2026-09-14", "2026-09-15"], "en")).toBe(
      "14–16 September 2026",
    );
  });

  it("lists scattered days under one month name", () => {
    expect(formatCompetitionDates(["2026-09-05", "2026-09-12", "2026-09-19"])).toBe(
      "5, 12, 19 กันยายน 2569",
    );
    expect(formatCompetitionDates(["2026-09-05", "2026-09-06", "2026-09-19"])).toBe(
      "5–6, 19 กันยายน 2569",
    );
  });

  it("names each month once and the year once", () => {
    expect(
      formatCompetitionDates(["2026-09-05", "2026-09-12", "2026-10-03", "2026-10-10"]),
    ).toBe("5, 12 กันยายน และ 3, 10 ตุลาคม 2569");
    expect(formatCompetitionDates(["2026-09-05", "2026-10-03", "2026-11-07"], "en")).toBe(
      "5 September, 3 October and 7 November 2026",
    );
  });

  it("writes a run that crosses a month or a year boundary in full", () => {
    expect(formatCompetitionDates(["2026-09-30", "2026-10-01", "2026-10-02"])).toBe(
      "30 กันยายน – 2 ตุลาคม 2569",
    );
    expect(formatCompetitionDates(["2026-12-31", "2027-01-01"])).toBe(
      "31 ธันวาคม 2569 – 1 มกราคม 2570",
    );
  });

  it("carries the year per month when the days straddle a new year", () => {
    expect(formatCompetitionDates(["2026-12-26", "2027-01-02"])).toBe(
      "26 ธันวาคม 2569 และ 2 มกราคม 2570",
    );
  });

  it("is empty when there is nothing to show", () => {
    expect(formatCompetitionDates([])).toBe("");
    expect(formatCompetitionDates(["ปลายเดือนกันยายน"])).toBe("");
  });
});

describe("formatCompetitionSpan", () => {
  it("reads like the full form for one day or one unbroken run", () => {
    expect(formatCompetitionSpan(["2026-09-14"])).toBe("14 กันยายน 2569");
    expect(formatCompetitionSpan(["2026-09-14", "2026-09-15"])).toBe("14–15 กันยายน 2569");
    expect(formatCompetitionSpan(["2026-09-30", "2026-10-01"])).toBe(
      "30 กันยายน – 1 ตุลาคม 2569",
    );
  });

  it("collapses a scattered season to first – last with the day count", () => {
    const saturdays = [
      "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26",
      "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31",
    ];
    expect(formatCompetitionSpan(saturdays)).toBe("5 กันยายน – 31 ตุลาคม 2569 (9 วัน)");
    expect(formatCompetitionSpan(saturdays.slice(0, 4))).toBe("5–26 กันยายน 2569 (4 วัน)");
    expect(formatCompetitionSpan(saturdays.slice(0, 4), "en")).toBe(
      "5–26 September 2026 (4 days)",
    );
    expect(formatCompetitionSpan(["2026-12-26", "2027-01-09"])).toBe(
      "26 ธันวาคม 2569 – 9 มกราคม 2570 (2 วัน)",
    );
  });

  it("is empty when there is nothing to show", () => {
    expect(formatCompetitionSpan([])).toBe("");
  });
});

describe("competitionDatesLabel", () => {
  it("formats the days, full or compact", () => {
    const t = { competitionDate: "2026-09-05", competitionDates: ["2026-09-05", "2026-09-12"] };
    expect(competitionDatesLabel(t)).toBe("5, 12 กันยายน 2569");
    expect(competitionDatesLabel(t, "en", "compact")).toBe("5–12 September 2026 (2 days)");
  });

  it("prints legacy free text as it is — it is still information", () => {
    expect(competitionDatesLabel({ competitionDate: "ปลายเดือนกันยายน" })).toBe("ปลายเดือนกันยายน");
    expect(competitionDatesLabel({ competitionDate: "" })).toBe("");
  });
});
