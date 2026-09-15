import { describe, expect, it } from "vitest";
import {
  dobSchema,
  dobToIso,
  makePersonalSchema,
  normalizeThaiPhone,
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
