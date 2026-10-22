import { describe, expect, it } from "vitest";
import {
  groupsForDay,
  isPerDaySchedule,
  isScheduleDay,
  liveScheduleFor,
  newScheduleId,
  parseScheduleGroups,
  scheduleByDay,
  scheduleStartMinutes,
  serializeScheduleGroups,
  sortedEntries,
} from "@/lib/schedule";
import type { ScheduleEntry, ScheduleGroup } from "@/lib/data/types";

// กำหนดการ lives in one free-text column, so every read goes through
// parseScheduleGroups and a stricter parse is indistinguishable from an empty
// schedule: the public page simply shows nothing, for a tournament whose
// timetable was entered months ago. The legacy shapes below are what that
// column actually holds for older tournaments.

const entry = (over: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  id: "e1",
  time: "09:00",
  type: "match",
  boardNumber: null,
  note: null,
  ...over,
});

describe("serializeScheduleGroups / parseScheduleGroups", () => {
  it("round-trips the current grouped shape", () => {
    const groups: ScheduleGroup[] = [
      {
        categoryIds: ["c1", "c2"],
        entries: [
          entry({ id: "e1", time: "09:00", type: "opening" }),
          entry({ id: "e2", time: "10:00", boardNumber: "1-8", note: "รอบ 1" }),
        ],
      },
    ];
    expect(parseScheduleGroups(serializeScheduleGroups(groups))).toEqual(groups);
  });

  it("treats an empty, absent or free-text column as no schedule", () => {
    // Pre-builder tournaments hold prose here; it is dropped rather than shown
    // as a broken table.
    expect(serializeScheduleGroups([])).toBe("[]");
    expect(parseScheduleGroups(null)).toEqual([]);
    expect(parseScheduleGroups(undefined)).toEqual([]);
    expect(parseScheduleGroups("")).toEqual([]);
    expect(parseScheduleGroups("09:00 ลงทะเบียน")).toEqual([]);
    expect(parseScheduleGroups("{}")).toEqual([]);
    expect(parseScheduleGroups('"09:00"')).toEqual([]);
  });

  it("accepts a legacy single categoryId on a group", () => {
    expect(
      parseScheduleGroups(
        JSON.stringify([{ categoryId: "c1", entries: [entry()] }]),
      ),
    ).toEqual([{ categoryIds: ["c1"], entries: [entry()] }]);
  });

  it("regroups a legacy flat item list, keeping first-seen รุ่น order", () => {
    const raw = JSON.stringify([
      { id: "a", categoryId: "c2", time: "09:00", type: "opening" },
      { id: "b", categoryId: "c1", time: "10:00", type: "match" },
      { id: "c", categoryId: "c2", time: "12:00", type: "lunch" },
      { id: "d", time: "13:00", type: "match" }, // no รุ่น — nothing to attach to
    ]);
    expect(parseScheduleGroups(raw)).toEqual([
      {
        categoryIds: ["c2"],
        entries: [
          entry({ id: "a", time: "09:00", type: "opening" }),
          entry({ id: "c", time: "12:00", type: "lunch" }),
        ],
      },
      { categoryIds: ["c1"], entries: [entry({ id: "b", time: "10:00" })] },
    ]);
  });

  it("drops a group with no รุ่น and an entry with an unknown type", () => {
    // The type drives the label and the icon, so an unrecognised one has
    // nothing to render as.
    const raw = JSON.stringify([
      { categoryIds: [], entries: [entry()] },
      { categoryIds: ["c1"], entries: [entry({ id: "ok" }), { id: "x", type: "tea_break" }] },
    ]);
    expect(parseScheduleGroups(raw)).toEqual([
      { categoryIds: ["c1"], entries: [entry({ id: "ok" })] },
    ]);
  });

  it("keeps a รุ่น the admin has not filled in yet", () => {
    // Which shape a payload is read as turns on whether ANY element carries an
    // `entries` key — that is what separates a grouped payload from the legacy
    // flat list, whose items carry a categoryId instead. serializeScheduleGroups
    // always writes the key, so an empty รุ่น survives a round-trip…
    const empty: ScheduleGroup[] = [{ categoryIds: ["c1"], entries: [] }];
    expect(parseScheduleGroups(serializeScheduleGroups(empty))).toEqual(empty);
    // …while a hand-written payload with no `entries` key anywhere reads as the
    // legacy flat shape, where an item without a categoryId has no รุ่น to join.
    expect(parseScheduleGroups(JSON.stringify([{ categoryIds: ["c1"] }]))).toEqual(
      [],
    );
  });

  it("normalises the optional fields an older row may hold", () => {
    const parsed = parseScheduleGroups(
      JSON.stringify([
        {
          categoryIds: ["c1", 7, "", "c2"],
          entries: [{ type: "match", boardNumber: "", note: "" }],
        },
      ]),
    );
    expect(parsed[0].categoryIds).toEqual(["c1", "c2"]);
    expect(parsed[0].entries[0].time).toBe("");
    expect(parsed[0].entries[0].boardNumber).toBeNull();
    expect(parsed[0].entries[0].note).toBeNull();
    // A row saved before entries carried ids still needs one to key the list.
    expect(parsed[0].entries[0].id).toBeTruthy();
  });
});

describe("ScheduleGroup.day in the stored JSON", () => {
  it("round-trips a per-day schedule", () => {
    const groups: ScheduleGroup[] = [
      { categoryIds: ["c1"], entries: [entry({ id: "sat" })], day: 1 },
      { categoryIds: ["c1"], entries: [entry({ id: "sun", time: "08:30" })], day: 2 },
    ];
    expect(parseScheduleGroups(serializeScheduleGroups(groups))).toEqual(groups);
  });

  it("reads a row saved before days existed with no day key at all", () => {
    // The shape every tournament's column holds today (Lotus's x Buddy GO's
    // four ตาราง among them): it must parse — and so write back — unchanged.
    const raw = JSON.stringify([
      { categoryIds: ["c1", "c2"], entries: [entry()] },
      { categoryIds: ["c3"], entries: [entry({ id: "e2" })] },
    ]);
    const parsed = parseScheduleGroups(raw);
    expect(parsed.every((g) => !("day" in g))).toBe(true);
    expect(serializeScheduleGroups(parsed)).toBe(raw);
  });

  it("treats a day that is not a whole number from 1 as every day", () => {
    const parsed = parseScheduleGroups(
      JSON.stringify(
        [null, 0, -1, 1.5, "2", true].map((day, i) => ({
          categoryIds: [`c${i}`],
          entries: [],
          day,
        })),
      ),
    );
    expect(parsed).toHaveLength(6);
    expect(parsed.every((g) => !("day" in g))).toBe(true);
  });

  it("isScheduleDay", () => {
    expect(isScheduleDay(1)).toBe(true);
    expect(isScheduleDay(10)).toBe(true);
    expect(isScheduleDay(0)).toBe(false);
    expect(isScheduleDay(2.5)).toBe(false);
    expect(isScheduleDay("1")).toBe(false);
    expect(isScheduleDay(null)).toBe(false);
  });
});

const g = (day: number | null, id: string): ScheduleGroup => ({
  categoryIds: [id],
  entries: [],
  ...(day != null ? { day } : {}),
});

describe("isPerDaySchedule / groupsForDay", () => {
  it("is per-day as soon as one ตาราง has a day", () => {
    expect(isPerDaySchedule([])).toBe(false);
    expect(isPerDaySchedule([g(null, "a"), g(null, "b")])).toBe(false);
    expect(isPerDaySchedule([g(1, "a"), g(2, "b")])).toBe(true);
  });

  it("gives a day its own ตาราง plus any every-day one", () => {
    const groups = [g(1, "sat"), g(2, "sun"), g(null, "both")];
    expect(groupsForDay(groups, 1).map((x) => x.categoryIds[0])).toEqual(["sat", "both"]);
    expect(groupsForDay(groups, 2).map((x) => x.categoryIds[0])).toEqual(["sun", "both"]);
    expect(groupsForDay(groups, 3).map((x) => x.categoryIds[0])).toEqual(["both"]);
  });
});

describe("scheduleByDay", () => {
  const days = ["2026-10-24", "2026-10-25"];

  it("is null for an every-day schedule, which renders flat as before", () => {
    expect(scheduleByDay([g(null, "a")], days)).toBeNull();
  });

  it("is null with no days to hang a per-day schedule on (free-text date)", () => {
    expect(scheduleByDay([g(1, "a")], [])).toBeNull();
  });

  it("lists every day in order — an empty one too — and drops a removed day's ตาราง", () => {
    const out = scheduleByDay([g(2, "sun"), g(3, "gone")], days);
    expect(out?.map((d) => [d.day, d.iso, d.groups.map((x) => x.categoryIds[0])])).toEqual([
      [1, "2026-10-24", []],
      [2, "2026-10-25", ["sun"]],
    ]);
  });
});

// The live board shows one day's ตาราง. "Now" is pinned to instants, and the
// day boundary is Bangkok midnight (17:00 UTC), not the server's: Vercel runs
// in UTC, where 18:00Z on Saturday is still Saturday — and Bangkok is already
// an hour into Sunday, Sunday's board numbers and all.
describe("liveScheduleFor", () => {
  const days = ["2026-10-24", "2026-10-25"]; // Sat + Sun
  const groups = [g(1, "sat"), g(2, "sun")];
  const at = (iso: string) => Date.parse(iso);
  const names = (r: { groups: ScheduleGroup[] }) => r.groups.map((x) => x.categoryIds[0]);

  it("passes an every-day schedule through untouched, with no day", () => {
    const everyDay = [g(null, "a"), g(null, "b")];
    const r = liveScheduleFor(everyDay, days, at("2026-10-25T02:00:00Z"));
    expect(r).toEqual({ groups: everyDay, day: "" });
  });

  it("shows today's ตาราง on a competition day", () => {
    const sat = liveScheduleFor(groups, days, at("2026-10-24T02:00:00Z")); // Sat 09:00 BKK
    expect([names(sat), sat.day]).toEqual([["sat"], "2026-10-24"]);
    const sun = liveScheduleFor(groups, days, at("2026-10-25T01:30:00Z")); // Sun 08:30 BKK
    expect([names(sun), sun.day]).toEqual([["sun"], "2026-10-25"]);
  });

  it("turns the day over at Bangkok midnight", () => {
    // 16:59Z Saturday is 23:59 Saturday in Bangkok; 17:00Z is Sunday 00:00.
    expect(liveScheduleFor(groups, days, at("2026-10-24T16:59:00Z")).day).toBe("2026-10-24");
    expect(liveScheduleFor(groups, days, at("2026-10-24T17:00:00Z")).day).toBe("2026-10-25");
  });

  it("shows the next day before and between competition days, the last one after", () => {
    const league = ["2026-10-03", "2026-10-10"]; // two Saturdays
    const lg = [g(1, "first"), g(2, "second")];
    expect(liveScheduleFor(lg, league, at("2026-09-30T05:00:00Z")).day).toBe("2026-10-03");
    expect(liveScheduleFor(lg, league, at("2026-10-06T05:00:00Z")).day).toBe("2026-10-10");
    expect(liveScheduleFor(lg, league, at("2026-10-20T05:00:00Z")).day).toBe("2026-10-10");
  });

  it("keeps an every-day ตาราง in a mixed row on every day", () => {
    const mixed = [g(1, "sat"), g(null, "both")];
    expect(names(liveScheduleFor(mixed, days, at("2026-10-25T02:00:00Z")))).toEqual(["both"]);
  });

  it("does not filter when there are no days to pick from", () => {
    expect(liveScheduleFor(groups, [], at("2026-10-25T02:00:00Z"))).toEqual({
      groups,
      day: "",
    });
  });
});

describe("newScheduleId", () => {
  it("is unique", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newScheduleId()));
    expect(ids.size).toBe(50);
  });
});

describe("scheduleStartMinutes", () => {
  it("reads the leading clock time, in either separator", () => {
    expect(scheduleStartMinutes("09:00")).toBe(540);
    expect(scheduleStartMinutes("9.30")).toBe(570);
    expect(scheduleStartMinutes("09:00–10:30")).toBe(540);
    expect(scheduleStartMinutes("ประมาณ 13:45 น.")).toBe(825);
  });

  it("sorts an unparseable or blank time last", () => {
    expect(scheduleStartMinutes("")).toBe(Number.MAX_SAFE_INTEGER);
    expect(scheduleStartMinutes("ช่วงบ่าย")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("sortedEntries", () => {
  it("orders by start time and keeps the authored order for ties and blanks", () => {
    // Stability is the whole contract: two 09:00 entries must stay in the order
    // the admin typed them, and blanks must not jump to the top.
    const entries = [
      entry({ id: "late", time: "13:00" }),
      entry({ id: "blank", time: "" }),
      entry({ id: "early1", time: "09:00" }),
      entry({ id: "early2", time: "09:00" }),
      entry({ id: "noon", time: "12.00" }),
    ];
    expect(sortedEntries(entries).map((e) => e.id)).toEqual([
      "early1",
      "early2",
      "noon",
      "late",
      "blank",
    ]);
    // Non-mutating: the admin builder renders from its own array.
    expect(entries[0].id).toBe("late");
  });
});
