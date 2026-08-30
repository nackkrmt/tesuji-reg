import { describe, expect, it } from "vitest";
import { buildCategoryTxtFiles, mmRankFromPower } from "@/lib/export";
import type { BatchWithSeats, Category, RegistrationSeat } from "@/lib/data/types";

// These files are read by the MacMahon pairing software, so their exact shape
// is a contract with an external program: a wrong rank token or a lost CRLF
// corrupts a real tournament's pairings, and nothing in the app would notice.
const seat = (over: Partial<RegistrationSeat>): RegistrationSeat =>
  ({
    id: "s1",
    categoryId: "c1",
    titlePrefix: "นาย",
    titleCustom: null,
    firstNameTh: "สมชาย",
    lastNameTh: "ใจดี",
    firstNameEn: "",
    lastNameEn: "",
    hasMiddleName: false,
    middleNameTh: null,
    middleNameEn: null,
    powerLevel: 0,
    ...over,
  }) as unknown as RegistrationSeat;

const batch = (seats: RegistrationSeat[]): BatchWithSeats =>
  ({ batch: { id: "b1", status: "confirmed" }, seats }) as unknown as BatchWithSeats;

const cat = (over: Partial<Category>): Category =>
  ({ id: "c1", code: "A", name: "รุ่นทั่วไป", sortOrder: 0, ...over }) as unknown as Category;

describe("mmRankFromPower", () => {
  it("emits a compact kyu token", () => {
    expect(mmRankFromPower(0)).toBe("15K");
    expect(mmRankFromPower(5)).toBe("10K");
    expect(mmRankFromPower(14)).toBe("1K");
  });

  it("emits a compact dan token", () => {
    expect(mmRankFromPower(15)).toBe("1D");
    expect(mmRankFromPower(22)).toBe("8D");
  });

  it("falls back to the ladder floor for null, undefined and off-ladder values", () => {
    expect(mmRankFromPower(null)).toBe("15K");
    expect(mmRankFromPower(undefined)).toBe("15K");
    expect(mmRankFromPower(23)).toBe("15K");
  });
});

describe("buildCategoryTxtFiles", () => {
  it("writes one file per non-empty category, named <code>_<name>_MMImport.txt", () => {
    const files = buildCategoryTxtFiles(
      [batch([seat({ categoryId: "c1" })])],
      [cat({ id: "c1", code: "A1", name: "รุ่นทั่วไป" })],
    );
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe("A1_รุ่นทั่วไป_MMImport.txt");
  });

  it("skips categories with no participants", () => {
    const files = buildCategoryTxtFiles(
      [batch([seat({ categoryId: "c1" })])],
      [cat({ id: "c1", code: "A" }), cat({ id: "c2", code: "B" })],
    );
    expect(files.map((f) => f.filename)).toEqual(["A_รุ่นทั่วไป_MMImport.txt"]);
  });

  it("uses CRLF endings and a trailing newline", () => {
    const files = buildCategoryTxtFiles(
      [
        batch([
          seat({ id: "s1", firstNameTh: "สมชาย", lastNameTh: "ใจดี", powerLevel: 14 }),
          seat({ id: "s2", firstNameTh: "สมหญิง", lastNameTh: "รักดี", powerLevel: 0 }),
        ]),
      ],
      [cat({})],
    );
    expect(files[0].content).toBe("สมชาย ใจดี||35K\r\nสมหญิง รักดี||35K\r\n");
  });

  it("orders players strongest first", () => {
    const files = buildCategoryTxtFiles(
      [
        batch([
          seat({ id: "s1", firstNameTh: "อ่อน", powerLevel: 0 }),
          seat({ id: "s2", firstNameTh: "เก่ง", powerLevel: 20 }),
          seat({ id: "s3", firstNameTh: "กลาง", powerLevel: 10 }),
        ]),
      ],
      [cat({})],
    );
    expect(files[0].content.split("\r\n").filter(Boolean).map((l) => l.split(" ")[0])).toEqual([
      "เก่ง",
      "กลาง",
      "อ่อน",
    ]);
  });

  it("seeds every player at the fixed MacMahon entry rank, not their own", () => {
    // Real ranks are assigned inside the pairing software; the importer expects
    // one uniform token.
    const files = buildCategoryTxtFiles(
      [batch([seat({ powerLevel: 22 }), seat({ id: "s2", powerLevel: 0 })])],
      [cat({})],
    );
    for (const line of files[0].content.split("\r\n").filter(Boolean)) {
      expect(line.endsWith("||35K")).toBe(true);
    }
  });

  it("collects seats for one category across separate batches", () => {
    const files = buildCategoryTxtFiles(
      [
        batch([seat({ id: "s1", firstNameTh: "ก" })]),
        batch([seat({ id: "s2", firstNameTh: "ข" })]),
      ],
      [cat({})],
    );
    expect(files[0].content.split("\r\n").filter(Boolean)).toHaveLength(2);
  });

  it("orders files by sortOrder, then by code", () => {
    const files = buildCategoryTxtFiles(
      [
        batch([
          seat({ id: "s1", categoryId: "c1" }),
          seat({ id: "s2", categoryId: "c2" }),
          seat({ id: "s3", categoryId: "c3" }),
        ]),
      ],
      [
        cat({ id: "c1", code: "C", sortOrder: 2 }),
        cat({ id: "c2", code: "B", sortOrder: 1 }),
        cat({ id: "c3", code: "A", sortOrder: 1 }),
      ],
    );
    expect(files.map((f) => f.filename[0])).toEqual(["A", "B", "C"]);
  });

  it("keeps Thai vowel and tone marks in the filename", () => {
    // Regression: these are combining marks (\p{M}), not letters, so a
    // sanitizer built only from \p{L}\p{N} replaced every one of them and
    // shipped "รุ่นทั่วไป" to the organizer as "ร-นท-วไป".
    const files = buildCategoryTxtFiles(
      [batch([seat({})])],
      [cat({ code: "ก1", name: "รุ่นอายุไม่เกิน ๑๒ ปี" })],
    );
    expect(files[0].filename).toBe("ก1_รุ่นอายุไม่เกิน ๑๒ ปี_MMImport.txt");
  });

  it("strips path separators from the filename", () => {
    const files = buildCategoryTxtFiles(
      [batch([seat({})])],
      [cat({ code: "A/B", name: "รุ่น: ทั่วไป" })],
    );
    expect(files[0].filename).not.toMatch(/[/:]/);
  });
});
