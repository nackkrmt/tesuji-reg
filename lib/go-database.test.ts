import { describe, expect, it } from "vitest";
import { parseGoDatabaseCsv, toMasterSheetDate } from "@/lib/go-database";

// event_date is free text and half of two keys the database reads back:
// admin_append_award_rows' (event_name, event_date, rank_in_category) replace
// key, and award_1kyu_event_count's distinct-event key. All 1,220 award rows in
// production are written the master sheet's way ("Aug 9, 2026", "Feb 21-22,
// 2026") and NOT ONE is ISO, so an ISO value silently forks one event into two:
// re-imports duplicate medals instead of replacing them, and a two-event
// medallist trips the automatic 3-event 1-kyu registration ban. These cases pin
// the canonical shape.

describe("toMasterSheetDate", () => {
  it("reshapes an ISO date into the master sheet's form", () => {
    expect(toMasterSheetDate("2026-08-09")).toBe("Aug 9, 2026");
    expect(toMasterSheetDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(toMasterSheetDate("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("passes existing corpus values through untouched", () => {
    // Multi-day ranges have no ISO equivalent — rewriting them would orphan the
    // rows they key.
    expect(toMasterSheetDate("Feb 21-22, 2026")).toBe("Feb 21-22, 2026");
    expect(toMasterSheetDate("April 28, 2024")).toBe("April 28, 2024");
    expect(toMasterSheetDate("Mar 21,2026")).toBe("Mar 21,2026");
  });

  it("trims but never reinterprets, and rejects an impossible month", () => {
    expect(toMasterSheetDate("  Aug 9, 2026  ")).toBe("Aug 9, 2026");
    expect(toMasterSheetDate("2026-13-01")).toBe("2026-13-01");
    expect(toMasterSheetDate("")).toBe("");
  });
});

describe("parseGoDatabaseCsv (award)", () => {
  const header =
    "firstname,lastname,rank_in_category,rank_award,category,event_name,date";

  it("normalises an ISO date cell to the master sheet's form", async () => {
    // The .xlsx path reaches the same boundary with a Date object; SheetJS
    // parses this CSV cell as a date too (cellDates), which is exactly the
    // conversion that used to emit ISO.
    const { rows } = await parseGoDatabaseCsv(
      "award",
      `${header}\nสมชาย,ใจดี,9-12 Kyu,1,รุ่นทั่วไป,ทดสอบ,2026-08-09\n`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].event_date).toBe("Aug 9, 2026");
  });

  it("keeps a free-text date range exactly as the sheet holds it", async () => {
    const { rows } = await parseGoDatabaseCsv(
      "award",
      `${header}\nสมชาย,ใจดี,9-12 Kyu,1,รุ่นทั่วไป,ทดสอบ,"Feb 21-22, 2026"\n`,
    );
    expect(rows[0].event_date).toBe("Feb 21-22, 2026");
  });
});
