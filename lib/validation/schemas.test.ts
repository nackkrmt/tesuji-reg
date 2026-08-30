import { describe, expect, it } from "vitest";
import { dobToIso, normalizeThaiPhone, yearToCE } from "@/lib/validation/schemas";

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
