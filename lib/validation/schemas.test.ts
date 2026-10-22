import { describe, expect, it } from "vitest";
import {
  dobSchema,
  dobToIso,
  emptyScheduleGroup,
  makePersonalSchema,
  normalizeThaiPhone,
  scheduleFormToGroups,
  scheduleGroupIssues,
  scheduleGroupsToForm,
  tournamentConfigSchema,
  yearToCE,
} from "@/lib/validation/schemas";
import { ageReferenceDate } from "@/lib/age";

describe("normalizeThaiPhone", () => {
  it("strips separators", () => {
    expect(normalizeThaiPhone("081-234-5678")).toBe("0812345678");
    expect(normalizeThaiPhone("081 234 5678")).toBe("0812345678");
    expect(normalizeThaiPhone("(081) 234-5678")).toBe("0812345678");
  });

  it("folds a +66 country code back to a leading zero", () => {
    expect(normalizeThaiPhone("+66812345678")).toBe("0812345678");
    expect(normalizeThaiPhone("+66 81 234 5678")).toBe("0812345678");
    expect(normalizeThaiPhone("0066812345678")).toBe("0066812345678");
  });

  it("leaves an already-normal number alone", () => {
    expect(normalizeThaiPhone("0812345678")).toBe("0812345678");
    expect(normalizeThaiPhone("0912345678")).toBe("0912345678");
    expect(normalizeThaiPhone("0612345678")).toBe("0612345678");
  });

  it("only folds 66 when the result is a full 10 digits", () => {
    // A landline-length string starting 66 must not lose its first two digits.
    expect(normalizeThaiPhone("6612345")).toBe("6612345");
  });
});

// Thai users routinely type Buddhist-era years; a mis-converted year silently
// shifts a child's age by 543 and hands them the wrong division.
describe("yearToCE", () => {
  it("converts a Buddhist-era year", () => {
    expect(yearToCE("2569")).toBe(2026);
    expect(yearToCE("2543")).toBe(2000);
  });

  it("leaves a Common Era year alone", () => {
    expect(yearToCE("2026")).toBe(2026);
    expect(yearToCE("1985")).toBe(1985);
  });

  it("switches at 2400", () => {
    expect(yearToCE("2399")).toBe(2399);
    expect(yearToCE("2400")).toBe(1857);
  });
});

describe("dobToIso", () => {
  it("builds a zero-padded ISO date", () => {
    expect(dobToIso({ d: "5", m: "3", y: "2543" })).toBe("2000-03-05");
    expect(dobToIso({ d: "05", m: "03", y: "2000" })).toBe("2000-03-05");
    expect(dobToIso({ d: "31", m: "12", y: "2569" })).toBe("2026-12-31");
  });

  it("applies the Buddhist-era conversion", () => {
    expect(dobToIso({ d: "1", m: "1", y: "2557" })).toBe("2014-01-01");
  });
});

// The server rejects a stored person whose dob is later than current_date with
// a bare INVALID_FIELD, at the end of the whole registration flow. The form is
// the only place that can still point at the field.
describe("dobSchema", () => {
  const parts = (d: Date) => ({
    d: String(d.getDate()),
    m: String(d.getMonth() + 1),
    y: String(d.getFullYear()),
  });

  it("accepts today", () => {
    expect(dobSchema.safeParse(parts(ageReferenceDate())).success).toBe(true);
  });

  it("rejects a date later this year", () => {
    const today = ageReferenceDate();
    const soon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    // Only meaningful while tomorrow is still in the same year; on 31 December
    // the year bound already catches it, which is also a rejection.
    expect(dobSchema.safeParse(parts(soon)).success).toBe(false);
  });

  it("still accepts a normal birth date", () => {
    expect(dobSchema.safeParse({ d: "15", m: "6", y: "2000" }).success).toBe(true);
    // Buddhist-era years keep working.
    expect(dobSchema.safeParse({ d: "15", m: "6", y: "2543" }).success).toBe(true);
  });
});

// reserve_seats refuses a name over 100 characters (title_custom over 50) the
// same way — after everything else has been filled in.
describe("makePersonalSchema name bounds", () => {
  const base = {
    titlePrefix: "นาย",
    titleCustom: "",
    firstNameTh: "สมชาย",
    lastNameTh: "ใจดี",
    firstNameEn: "",
    lastNameEn: "",
    hasMiddleName: false,
    phone: "0812345678",
    dob: { d: "15", m: "6", y: "2000" },
    powerLevel: "0",
    province: "กรุงเทพมหานคร",
    instituteId: null,
    instituteName: "สถาบัน",
    pdpaConsent: true,
  };

  it("accepts a normal person", () => {
    expect(makePersonalSchema().safeParse(base).success).toBe(true);
  });

  it("rejects a 101-character Thai name", () => {
    const long = "ก".repeat(101);
    expect(
      makePersonalSchema().safeParse({ ...base, firstNameTh: long }).success,
    ).toBe(false);
  });

  it("rejects a 51-character custom title", () => {
    expect(
      makePersonalSchema().safeParse({
        ...base,
        titlePrefix: "อื่นๆ",
        titleCustom: "ก".repeat(51),
      }).success,
    ).toBe(false);
  });
});

// กำหนดการ per competition day. The admin form saves through
// tournamentConfigSchema; a ตาราง the schema let through on a removed day, or a
// รุ่น in two ตาราง of one day, is a timetable the board cannot place.
describe("schedule days", () => {
  const entry = { id: "e1", time: "09:00", type: "match" as const, boardNumber: "1", note: "" };
  const group = (day: number | null, ...categoryIds: string[]) => ({
    categoryIds,
    entries: [entry],
    day,
  });

  describe("scheduleGroupIssues", () => {
    it("accepts an every-day schedule and a clean per-day one", () => {
      expect(scheduleGroupIssues([group(null, "a"), group(null, "b")], 2)).toEqual([]);
      // The same รุ่น on Saturday and on Sunday is the whole point.
      expect(scheduleGroupIssues([group(1, "a"), group(2, "a"), group(2, "b")], 2)).toEqual([]);
    });

    it("refuses a day the tournament does not have", () => {
      const issues = scheduleGroupIssues([group(1, "a"), group(3, "b")], 2);
      expect(issues.map((i) => i.path)).toEqual([[1, "day"]]);
      expect(issues[0].message).toContain("วันที่ 3");
    });

    it("refuses a mix of every-day and per-day ตาราง", () => {
      const issues = scheduleGroupIssues([group(1, "a"), group(null, "b")], 2);
      expect(issues.map((i) => i.path)).toEqual([[1, "day"]]);
    });

    it("refuses a รุ่น twice on one day, flagging every ตาราง that has it", () => {
      const issues = scheduleGroupIssues(
        [group(1, "a"), group(2, "a"), group(1, "b", "a")],
        2,
      );
      expect(issues.map((i) => i.path)).toEqual([
        [0, "categoryIds"],
        [2, "categoryIds"],
      ]);
      // …and in an every-day schedule, where the whole schedule is one day.
      expect(
        scheduleGroupIssues([group(null, "a"), group(null, "a")], 1).map((i) => i.path),
      ).toEqual([
        [0, "categoryIds"],
        [1, "categoryIds"],
      ]);
    });
  });

  describe("form ↔ stored", () => {
    it("writes an every-day ตาราง without a day key, and a per-day one with it", () => {
      const stored = scheduleFormToGroups([group(null, "a"), group(2, "b")]);
      expect("day" in stored[0]).toBe(false);
      expect(stored[1].day).toBe(2);
      expect(scheduleGroupsToForm(stored).map((g) => g.day)).toEqual([null, 2]);
    });

    it("starts a new ตาราง on the day it is added to", () => {
      expect(emptyScheduleGroup("x").day).toBeNull();
      expect(emptyScheduleGroup("x", 2).day).toBe(2);
    });
  });

  describe("tournamentConfigSchema", () => {
    const base = {
      nameTh: "รายการทดสอบ",
      bannerUrl: "",
      venueMapUrl: "",
      competitionDates: ["2026-10-24", "2026-10-25"],
      locationText: "ที่จัดงาน",
      locationMapsUrl: "",
      registrationOpensAt: "2026-09-01T09:00",
      registrationClosesAt: "2026-10-20T18:00",
      promptpayTargetType: "merchant_qr" as const,
      promptpayTargetValue: "",
    };
    // Only the schedule's issues — the QR in `base` is not the point here.
    const scheduleIssues = (scheduleGroups: unknown[], competitionDates = base.competitionDates) => {
      const r = tournamentConfigSchema.safeParse({ ...base, competitionDates, scheduleGroups });
      return r.success
        ? []
        : r.error.issues.filter((i) => i.path[0] === "scheduleGroups").map((i) => i.path.join("."));
    };

    it("counts days the way the readers do, and points at the ตาราง", () => {
      expect(scheduleIssues([group(1, "a"), group(2, "a")])).toEqual([]);
      // Sunday removed: วันที่ 2's ตาราง is now on no day.
      expect(scheduleIssues([group(1, "a"), group(2, "a")], ["2026-10-24"])).toEqual([
        "scheduleGroups.1.day",
      ]);
    });

    it("reads a ตาราง with no day as every day, like the stored JSON", () => {
      const { day: _drop, ...noDay } = group(null, "a");
      void _drop;
      expect(scheduleIssues([noDay])).toEqual([]);
    });

    it("refuses a day that is not a whole number from 1", () => {
      expect(scheduleIssues([group(0, "a")])).toEqual(["scheduleGroups.0.day"]);
    });
  });
});
