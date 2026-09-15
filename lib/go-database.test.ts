import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  awardKyu,
  normalizeThaiName,
  parseGoDatabaseCsv,
  toMasterSheetDate,
} from "@/lib/go-database";

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

  it("skips a row whose category is not a kyu, or whose place is out of range", async () => {
    // A skipped row is a person who silently keeps no award record at all, so
    // the boundaries matter: 1..10 (deeper than the podium, because
    // /admin/awards records deeper places), and a dan category is not an award
    // kyu — an award may never promote past 1 kyu.
    const { rows, skipped } = await parseGoDatabaseCsv(
      "award",
      `${header}\n` +
        `ก,ข,1 Dan,1,รุ่น,งาน,"Aug 9, 2026"\n` +
        `ค,ง,9-12 Kyu,0,รุ่น,งาน,"Aug 9, 2026"\n` +
        `จ,ฉ,9-12 Kyu,11,รุ่น,งาน,"Aug 9, 2026"\n` +
        `ช,ซ,9-12 Kyu,10,รุ่น,งาน,"Aug 9, 2026"\n`,
    );
    expect(rows.map((r) => r.rank_award)).toEqual([10]);
    expect(skipped).toBe(3);
  });
});

// The rank_in_category → kyu rules of docs/rank-databases.md, with that doc's
// own worked examples. awardKyu is what turns a medal into a power_level, and
// power_level is what the division picker and reserve_seats both judge a player
// by: one wrong row re-ranks a real child.
describe("awardKyu", () => {
  it("maps the board-size categories to a nudge above the floor", () => {
    expect(awardKyu("9x9")).toEqual({ rank: "14 Kyu", power: 1 });
    expect(awardKyu("13x13")).toEqual({ rank: "13 Kyu", power: 2 });
    // The sheet is typed by hand, so the lookup is whitespace- and case-blind.
    expect(awardKyu(" 13 X 13 ")).toEqual({ rank: "13 Kyu", power: 2 });
  });

  it("promotes one kyu above the strong end of a range", () => {
    expect(awardKyu("5-8 Kyu")).toEqual({ rank: "4 Kyu", power: 11 });
    expect(awardKyu("9-12 Kyu")).toEqual({ rank: "8 Kyu", power: 7 });
    // "12-9" is the same range written the other way round: min(), not first().
    expect(awardKyu("12-9 Kyu")).toEqual({ rank: "8 Kyu", power: 7 });
    expect(awardKyu("9-12")).toEqual({ rank: "8 Kyu", power: 7 });
  });

  it("promotes one kyu above a single-rank category", () => {
    expect(awardKyu("3 Kyu")).toEqual({ rank: "2 Kyu", power: 13 });
    expect(awardKyu("3kyu")).toEqual({ rank: "2 Kyu", power: 13 });
  });

  it("never promotes past 1 kyu and never below 15 kyu", () => {
    // The whole point of the cap: an award may not make anyone a dan player.
    expect(awardKyu("1 Kyu")).toEqual({ rank: "1 Kyu", power: 14 });
    expect(awardKyu("2 Kyu")).toEqual({ rank: "1 Kyu", power: 14 });
    expect(awardKyu("20 Kyu")).toEqual({ rank: "15 Kyu", power: 0 });
  });

  it("returns null for anything that is not a kyu category", () => {
    expect(awardKyu("1 Dan")).toBeNull();
    expect(awardKyu("ประถม")).toBeNull();
    expect(awardKyu("")).toBeNull();
    expect(awardKyu(null)).toBeNull();
    expect(awardKyu(undefined)).toBeNull();
    expect(awardKyu("19x19")).toBeNull();
  });

  it("skips a category whose kyu is out of range rather than awarding 1 Kyu", () => {
    // ease() used to clamp at 1, so a typo in rank_in_category did not skip the
    // row — it awarded 1 kyu (power 14), the single strongest kyu and the exact
    // rank the server-side award ceiling watches. A slip of the finger could
    // hand a beginner the rank that blocks them from registering.
    expect(awardKyu("0 Kyu")).toBeNull();
    expect(awardKyu("0-0 Kyu")).toBeNull();
    // Only the BELOW-1 end is nonsensical. A beginners' category written weaker
    // than 15 kyu is a real thing and still clamps to the 15-kyu floor.
    expect(awardKyu("20 Kyu")).toEqual({ rank: "15 Kyu", power: 0 });
    // The real categories either side of the boundary still resolve.
    expect(awardKyu("1 Kyu")).toEqual({ rank: "1 Kyu", power: 14 });
    expect(awardKyu("15 Kyu")).toEqual({ rank: "14 Kyu", power: 1 });
  });
});

describe("parseGoDatabaseCsv (dan)", () => {
  const header = "seq,prefix,firstname,lastname,year,rank,diamond,gat";

  it("maps the DAN sheet's example rows, capping at 8 dan", async () => {
    const { rows } = await parseGoDatabaseCsv(
      "dan",
      `${header}\n` +
        `1,นาย,สมชาย,ทองดี,2018,3,มี,2200\n` +
        `2,น.ส.,สมหญิง,รักเรียน,2010,9,,2800\n`,
    );
    expect(
      rows.map((r) => [r.rank, r.power_level, r.rating, r.year_promoted, r.diamond]),
    ).toEqual([
      ["3 Dan", 17, 2200, 2018, "มี"],
      ["8 Dan", 22, 2800, 2010, null],
    ]);
  });

  it("skips a row with no rank, a fractional rank or a missing name", async () => {
    const { rows, skipped } = await parseGoDatabaseCsv(
      "dan",
      `${header}\n` +
        `1,,สมชาย,ทองดี,2018,0,,\n` +
        `2,,วิชัย,มั่นคง,2018,2.5,,\n` +
        `3,,มานะ,,2018,3,,\n` +
        `4,,ดาว,ประกาย,2018,1,,\n`,
    );
    expect(rows.map((r) => r.rank)).toEqual(["1 Dan"]);
    expect(skipped).toBe(3);
  });
});

describe("parseGoDatabaseCsv (kyu)", () => {
  const header = "seq,firstname,lastname,rank,date";

  it("maps the KYU sheet's example rows, capping at 15 kyu", async () => {
    const { rows } = await parseGoDatabaseCsv(
      "kyu",
      `${header}\n` +
        `1,วิชัย,มั่นคง,5,2022-05-15\n` +
        `2,มานะ,อดทน,20,2021-01-10\n`,
    );
    expect(rows.map((r) => [r.rank, r.power_level, r.event_date])).toEqual([
      ["5 Kyu", 10, "2022-05-15"],
      ["15 Kyu", 0, "2021-01-10"],
    ]);
  });

  it("keeps the stronger of two rows for the same NORMALIZED name", async () => {
    // "ศิริ ใจดี" and "สิริ ไจดี" are one person as far as the database is
    // concerned, so the sheet holding both must not produce two rows with two
    // different ranks — the weaker one would win a later search at random.
    const { rows } = await parseGoDatabaseCsv(
      "kyu",
      `${header}\n` +
        `1,ศิริ,ใจดี,7,\n` +
        `2,สิริ,ไจดี,3,\n` +
        `3,มานะ,อดทน,8,\n` +
        `4,มานะ,อดทน,12,\n`,
    );
    expect(
      rows.map((r) => [
        r.first_name_th,
        r.first_name_th_normalized,
        r.rank,
        r.power_level,
      ]),
    ).toEqual([
      ["สิริ", "สิริ", "3 Kyu", 12],
      ["มานะ", "มานะ", "8 Kyu", 7],
    ]);
  });
});

// ── normalizeThaiName parity with the SQL twin ───────────────────────────────
// normalize_thai_name (SQL) and normalizeThaiName (TS) are two hand-written
// copies of one rule, and docs/rank-databases.md:129 says they must agree. They
// are the whole basis of cross-account duplicate detection and of the
// normalized tier of search_go_person, so drift does not raise an error — it
// quietly stops finding people, and the same child registers twice under two
// spellings.
//
// The test derives the rule from the SQL text rather than restating it: the
// translate() pair and the thanthakhat strip are read out of
// supabase/bootstrap/0001_dashboard_functions.sql (verified identical to the
// live function via pg_get_functiondef), reimplemented with Postgres semantics,
// and compared against the TS copy. A one-sided edit to either file fails here.
const SQL_FILE = join(
  __dirname,
  "..",
  "supabase",
  "bootstrap",
  "0001_dashboard_functions.sql",
);

function sqlNormalizeSource(): string {
  const src = readFileSync(SQL_FILE, "utf8");
  const def = src.match(
    /create\s+or\s+replace\s+function\s+public\.normalize_thai_name\s*\([\s\S]*?\$function\$([\s\S]*?)\$function\$/i,
  );
  if (!def) throw new Error("normalize_thai_name is no longer in the bootstrap SQL");
  return def[1];
}

const SQL_BODY = sqlNormalizeSource();

/** translate(from, to) — the confusable-letter pair, read out of the SQL. Both
 *  strings are pure Thai, which is what makes them findable without parsing
 *  the surrounding regexp_replace's own quoted arguments. */
const TRANSLATE = (() => {
  const m = SQL_BODY.match(
    /translate\([\s\S]*?'([\u0E00-\u0E7F]+)'\s*,\s*'([\u0E00-\u0E7F]+)'\s*\)/,
  );
  if (!m) throw new Error("no translate() pair found in normalize_thai_name");
  return { from: m[1], to: m[2] };
})();

/** replace(…, '์', '') — the character the rule strips. */
const STRIPPED = (() => {
  const m = SQL_BODY.match(/,\s*'([\u0E00-\u0E7F])'\s*,\s*''\s*\)/);
  if (!m) throw new Error("no mark-stripping replace() found in normalize_thai_name");
  return m[1];
})();

/** The SQL rule, reimplemented with Postgres semantics. Two of those matter:
 *  `trim(x)` is btrim(x, ' ') — it removes SPACES only, where JS .trim()
 *  removes every whitespace character; and translate() substitutes
 *  simultaneously, where the TS copy chains .replace() calls. */
function sqlNormalizeThaiName(input: string | null): string {
  const collapsed = (input ?? "").replace(/^ +| +$/g, "").replace(/\s+/g, " ");
  return [...collapsed]
    .map((ch) => {
      const i = TRANSLATE.from.indexOf(ch);
      return i < 0 ? ch : TRANSLATE.to[i];
    })
    .join("")
    .split(STRIPPED)
    .join("");
}

describe("normalizeThaiName / normalize_thai_name parity", () => {
  it("still reads the rule it is comparing against", () => {
    // A vacuous pass here would be worse than no test: the extraction must
    // fail loudly if the SQL is rewritten into a shape it cannot read.
    expect(TRANSLATE.from.length).toBeGreaterThanOrEqual(9);
    expect(STRIPPED).toBe("์");
    // Unequal lengths are a live Postgres hazard: translate() DELETES every
    // source character with no counterpart, so dropping one letter from the
    // replacement string would erase letters from every name in the database.
    expect(TRANSLATE.to.length).toBe(TRANSLATE.from.length);
    // The whitespace collapse happens after the trim, on the ASCII class.
    expect(SQL_BODY.replace(/\s+/g, " ")).toContain(
      "regexp_replace(trim(coalesce(input, '')), '\\s+', ' ', 'g')",
    );
  });

  it("translates every confusable letter the SQL lists", () => {
    for (const [i, ch] of [...TRANSLATE.from].entries()) {
      expect(normalizeThaiName(ch)).toBe(TRANSLATE.to[i]);
    }
  });

  it("agrees with the SQL rule on every Thai code point", () => {
    // Chaining .replace() is only equivalent to a simultaneous translate()
    // because no replacement character is itself a later rule's input. This
    // loop is what proves that, and would catch a future pair that breaks it.
    for (let cp = 0x0e01; cp <= 0x0e5b; cp++) {
      const ch = String.fromCodePoint(cp);
      expect(normalizeThaiName(`ก${ch}ข`)).toBe(sqlNormalizeThaiName(`ก${ch}ข`));
    }
  });

  it("agrees with the SQL rule on real names", () => {
    const corpus = [
      "ศิริ",
      "ณัฏฐ์",
      "ใหญ่",
      "ษมณฑภฎฏ",
      "รุ่นทั่วไป",
      "สมชาย ใจดี",
      "  สม   ชาย  ",
      "ญาณภัทร์",
      "",
      " ",
    ];
    for (const name of corpus) {
      expect(normalizeThaiName(name)).toBe(sqlNormalizeThaiName(name));
    }
    // Spot-checked against the live function, so the reimplementation above is
    // not just agreeing with itself.
    expect(normalizeThaiName("ศิริ")).toBe("สิริ");
    expect(normalizeThaiName("ณัฏฐ์")).toBe("นัตฐ");
    expect(normalizeThaiName("ใหญ่")).toBe("ไหย่");
    expect(normalizeThaiName("ษมณฑภฎฏ")).toBe("สมนทพดต");
    expect(normalizeThaiName("  สม   ชาย  ")).toBe("สม ชาย");
  });

  it("keeps Thai vowel and tone marks, which are combining marks", () => {
    // The lesson sanitizeFilenamePart learned the hard way: these are \p{M},
    // not \p{L}. A normalizer that dropped them would collapse "รุ่นทั่วไป" to
    // "รนทวไป" and match two different people as one.
    expect(normalizeThaiName("รุ่นทั่วไป")).toBe("รุ่นทั่วไป");
    expect(normalizeThaiName("เพ็ญ")).toBe("เพ็ย");
    expect([...normalizeThaiName("ก่ก้ก๊ก๋กักิกีกึกุกู")].length).toBe(20);
  });

  it("strips thanthakhat but not the letter under it", () => {
    expect(normalizeThaiName("ณัฏฐ์")).toBe(sqlNormalizeThaiName("ณัฏฐ์"));
    expect(normalizeThaiName("สิทธิ์")).toBe("สิทธิ");
  });

  it("treats a null name as empty, like coalesce() does", () => {
    expect(normalizeThaiName(null as unknown as string)).toBe("");
    expect(normalizeThaiName(undefined as unknown as string)).toBe("");
  });

  it("KNOWN DEFECT: padding that is not a space diverges from the SQL", () => {
    // Postgres trim() strips spaces only, so the tab survives the trim and the
    // \s+ collapse then turns it into a leading SPACE: the live function
    // returns " สมชาย " (verified with pg_get_functiondef + a select), while JS
    // .trim() removes it. A name that reaches the database with a tab or a
    // newline — a pasted CSV cell — therefore normalizes two different ways and
    // its duplicate is never found. Pinned as current behaviour; see handoffs.
    expect(normalizeThaiName("\tสมชาย\n")).toBe("สมชาย");
    expect(sqlNormalizeThaiName("\tสมชาย\n")).toBe(" สมชาย ");
    expect(normalizeThaiName("\tสมชาย\n")).not.toBe(
      sqlNormalizeThaiName("\tสมชาย\n"),
    );
  });
});
