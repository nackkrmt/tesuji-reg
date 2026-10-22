import { describe, expect, it } from "vitest";
import type { RulesSection, ScheduleGroup } from "@/lib/data/types";
import {
  cloneRulesSections,
  copyScheduleGroups,
  matchCategories,
  MAX_RULES_SECTIONS,
  mergeRulesSections,
  type ScheduleCopy,
  type ScheduleCopyRefused,
} from "./copy-from";

/** The copy, for a case that must not be refused. */
function made(r: ScheduleCopy | ScheduleCopyRefused): ScheduleCopy {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
  return r;
}

const rule = (title: string): RulesSection => ({
  title,
  blocks: [{ type: "paragraph", text: `${title} body` } as RulesSection["blocks"][number]],
});

describe("rules copy", () => {
  it("deep-clones, so editing the copy leaves the source alone", () => {
    const src = [rule("กติกา")];
    const copy = cloneRulesSections(src);
    copy[0].title = "แก้แล้ว";
    (copy[0].blocks[0] as { text: string }).text = "x";
    expect(src[0].title).toBe("กติกา");
    expect((src[0].blocks[0] as { text: string }).text).toBe("กติกา body");
  });

  it("replaces or appends", () => {
    const current = [rule("เดิม")];
    const copied = [rule("ใหม่ 1"), rule("ใหม่ 2")];
    const r = mergeRulesSections(current, copied, "replace");
    expect("sections" in r && r.sections.map((s) => s.title)).toEqual(["ใหม่ 1", "ใหม่ 2"]);
    const a = mergeRulesSections(current, copied, "append");
    expect("sections" in a && a.sections.map((s) => s.title)).toEqual(["เดิม", "ใหม่ 1", "ใหม่ 2"]);
  });

  it("refuses an append the editor could not save", () => {
    const current = Array.from({ length: MAX_RULES_SECTIONS - 1 }, (_, i) => rule(`r${i}`));
    const r = mergeRulesSections(current, [rule("a"), rule("b")], "append");
    expect("error" in r).toBe(true);
  });
});

const src = [
  { id: "s1", code: "A", name: "9-15 Kyu 9x9" },
  { id: "s2", code: "B", name: "7-8 Kyu" },
  { id: "s3", code: "C", name: "1 Dan ขึ้นไป" },
  { id: "s4", code: "Z", name: "รุ่นที่ไม่มีที่นี่" },
];

describe("matchCategories", () => {
  it("matches by name, ignoring case and spacing", () => {
    const target = [
      { id: "t1", code: "9", name: "9-15 kyu 9X9" },
      { id: "t2", code: "X", name: "7-8  kyu" },
      { id: "t3", code: "c", name: "1 Dan ขึ้นไป" },
    ];
    const { map, unmatched } = matchCategories(src, target);
    expect(map.get("s1")).toBe("t1");
    expect(map.get("s2")).toBe("t2");
    expect(map.get("s3")).toBe("t3");
    expect(unmatched).toEqual(["รุ่นที่ไม่มีที่นี่"]);
  });

  // The real pair that exposed code matching (production, 2026-10-08): the
  // codes are running numbers per event and line up with different รุ่น.
  it("ignores codes, which are running numbers per tournament", () => {
    const buddyGo = [
      { id: "b01", code: "01", name: "1-2 Kyu" },
      { id: "b02", code: "02", name: "3-4 Kyu" },
      { id: "b03", code: "03", name: "5-6 Kyu" },
      { id: "b04", code: "04", name: "7-8 Kyu" },
      { id: "b05", code: "05", name: "9-12 Kyu" },
      { id: "b06", code: "06", name: "13x13" },
      { id: "b07", code: "07", name: "9x9" },
    ];
    const lotus = [
      { id: "l01", code: "01", name: "1-2 Dan" },
      { id: "l02", code: "02", name: "1-2 Kyu" },
      { id: "l03", code: "03", name: "3-4 Kyu" },
      { id: "l04", code: "04", name: "5-6 Kyu" },
      { id: "l05", code: "05", name: "7-8 Kyu" },
      { id: "l06", code: "06", name: "9-12 Kyu" },
      { id: "l07", code: "07", name: "13x13" },
      { id: "l08", code: "08", name: "13x13 Senior" },
      { id: "l09", code: "09", name: "9x9" },
      { id: "l10", code: "10", name: "9x9 Senior" },
    ];
    const { map, unmatched } = matchCategories(buddyGo, lotus);
    expect(Object.fromEntries(map)).toEqual({
      b01: "l02",
      b02: "l03",
      b03: "l04",
      b04: "l05",
      b05: "l06",
      b06: "l07",
      b07: "l09",
    });
    expect(unmatched).toEqual([]);
  });

  it("does not match a รุ่น by code alone", () => {
    const { map, unmatched } = matchCategories(
      [{ id: "s", code: "01", name: "1-2 Kyu" }],
      [{ id: "t", code: "01", name: "1-2 Dan" }],
    );
    expect(map.size).toBe(0);
    expect(unmatched).toEqual(["1-2 Kyu"]);
  });

  it("never lands two source รุ่น on one target", () => {
    const { map, unmatched } = matchCategories(
      [{ id: "s1", code: "A", name: "n" }, { id: "s2", code: "A", name: "n" }],
      [{ id: "t1", code: "A", name: "n" }],
    );
    expect(map.size).toBe(1);
    expect(unmatched).toHaveLength(1);
  });
});

describe("copyScheduleGroups", () => {
  const groups: ScheduleGroup[] = [
    {
      categoryIds: ["s1", "s2"],
      entries: [
        { id: "e1", time: "09:00", type: "match", boardNumber: "1", note: null },
        { id: "e2", time: "12:00", type: "lunch", boardNumber: null, note: "พักเที่ยง" },
      ],
    },
    { categoryIds: ["s4"], entries: [{ id: "e3", time: "13:00", type: "match", boardNumber: "2", note: null }] },
  ];
  const target = [
    { id: "t1", code: "1", name: "9-15 Kyu 9x9" },
    { id: "t2", code: "2", name: "7-8 Kyu" },
  ];
  let n = 0;
  const newId = () => `new-${++n}`;

  it("re-points ตาราง at this tournament's รุ่น and gives entries fresh ids", () => {
    n = 0;
    const r = made(copyScheduleGroups(groups, src, target, { newId }));
    expect(r.groups[0].categoryIds).toEqual(["t1", "t2"]);
    expect(r.groups[0].entries.map((e) => e.id)).toEqual(["new-1", "new-2"]);
    expect(r.groups[0].entries[1]).toMatchObject({ time: "12:00", type: "lunch", note: "พักเที่ยง" });
    expect(groups[0].entries[0].id).toBe("e1"); // source untouched
  });

  it("keeps a ตาราง whose รุ่น are all missing, and says which รุ่น", () => {
    const r = made(copyScheduleGroups(groups, src, target, { newId }));
    expect(r.groups).toHaveLength(2);
    expect(r.groups[1].categoryIds).toEqual([]);
    expect(r.emptyGroups).toBe(1);
    expect(r.unmatched).toEqual(["รุ่นที่ไม่มีที่นี่"]);
  });

  it("only reports unmatched รุ่น that the copied ตาราง actually use", () => {
    const r = made(copyScheduleGroups([groups[0]], src, target, { newId }));
    expect(r.unmatched).toEqual([]);
  });

  it("in append mode, skips รุ่น a ตาราง that stays already uses", () => {
    const r = made(
      copyScheduleGroups(groups, src, target, {
        newId,
        existing: [{ categoryIds: ["t2"] }],
      }),
    );
    expect(r.groups[0].categoryIds).toEqual(["t1"]);
  });

  it("writes an every-day copy without a day key, as before days existed", () => {
    const r = made(copyScheduleGroups(groups, src, target, { newId, dayCount: 2 }));
    expect(r.groups.every((g) => !("day" in g))).toBe(true);
    expect(r.beyondDays).toBe(0);
    expect(r.ontoDay).toBeNull();
  });
});

// A per-day schedule (ScheduleGroup.day): Saturday and Sunday have their own
// ตาราง, often for the same รุ่น.
describe("copyScheduleGroups — per-day", () => {
  const twoDays: ScheduleGroup[] = [
    { day: 1, categoryIds: ["s1"], entries: [{ id: "a", time: "09:00", type: "match", boardNumber: "1", note: null }] },
    { day: 2, categoryIds: ["s1"], entries: [{ id: "b", time: "08:30", type: "match", boardNumber: "4", note: null }] },
    { day: 2, categoryIds: ["s2"], entries: [{ id: "c", time: "13:00", type: "match", boardNumber: "5", note: null }] },
  ];
  const target = [
    { id: "t1", code: "1", name: "9-15 Kyu 9x9" },
    { id: "t2", code: "2", name: "7-8 Kyu" },
  ];
  let n = 0;
  const newId = () => `id-${++n}`;

  it("keeps each ตาราง on its day — the same รุ่น on two days is not a clash", () => {
    const r = made(copyScheduleGroups(twoDays, src, target, { newId, dayCount: 2 }));
    expect(r.groups.map((g) => [g.day, g.categoryIds])).toEqual([
      [1, ["t1"]],
      [2, ["t1"]],
      [2, ["t2"]],
    ]);
    expect(r.emptyGroups).toBe(0);
    expect(r.beyondDays).toBe(0);
  });

  it("counts the ตาราง on a day this tournament does not have", () => {
    // Source ran Saturday + Sunday, this event is one day: วันที่ 2's two ตาราง
    // still come across (the editor flags them) and are reported.
    const r = made(copyScheduleGroups(twoDays, src, target, { newId, dayCount: 1 }));
    expect(r.groups).toHaveLength(3);
    expect(r.beyondDays).toBe(2);
  });

  it("appending skips a รุ่น only on the day that already has it", () => {
    const r = made(
      copyScheduleGroups(twoDays, src, target, {
        newId,
        dayCount: 2,
        existing: [{ day: 2, categoryIds: ["t1"] }],
      }),
    );
    expect(r.groups.map((g) => [g.day, g.categoryIds])).toEqual([
      [1, ["t1"]], // วันที่ 1 has no t1 yet
      [2, []], // วันที่ 2 does — this ตาราง is left with no รุ่น, and says so
      [2, ["t2"]],
    ]);
    expect(r.emptyGroups).toBe(1);
  });

  it("puts an every-day source appended to a per-day schedule on one day", () => {
    const everyDay: ScheduleGroup[] = [
      { categoryIds: ["s1"], entries: [] },
      { categoryIds: ["s2"], entries: [] },
    ];
    const r = made(
      copyScheduleGroups(everyDay, src, target, {
        newId,
        dayCount: 2,
        appendDay: 2,
        existing: [{ day: 2, categoryIds: ["t2"] }],
      }),
    );
    expect(r.ontoDay).toBe(2);
    expect(r.groups.map((g) => [g.day, g.categoryIds])).toEqual([
      [2, ["t1"]],
      [2, []], // t2 is already on วันที่ 2
    ]);
  });

  it("refuses to append a per-day source to an every-day schedule", () => {
    // Either its days would be merged (Saturday's and Sunday's times in one
    // ตาราง) or some dropped — neither may happen without the organiser.
    const r = copyScheduleGroups(twoDays, src, target, {
      newId,
      dayCount: 2,
      existing: [{ categoryIds: ["t2"] }],
    });
    expect("refused" in r).toBe(true);
    expect("refused" in r && r.refused).toContain("ใช้กำหนดการเดียวกันทุกวัน");
    // A one-day event has no switch to point at.
    const one = copyScheduleGroups(twoDays, src, target, {
      newId,
      dayCount: 1,
      existing: [{ categoryIds: ["t2"] }],
    });
    expect("refused" in one && one.refused).not.toContain("ใช้กำหนดการเดียวกันทุกวัน");
  });

  it("replaces freely: nothing stays, so nothing can clash or mix", () => {
    const r = copyScheduleGroups(twoDays, src, target, { newId, dayCount: 2, existing: [] });
    expect("refused" in r).toBe(false);
  });
});
