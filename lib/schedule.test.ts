import { describe, expect, it } from "vitest";
import {
  newScheduleId,
  parseScheduleGroups,
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
