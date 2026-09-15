// Parse the DAN / KYU / AWARD Excel databases into go_player_database rows.
// Column mappings + power-level rules mirror the tesuji-go-organizer system.

import type { WorkSheet } from "xlsx";
import { GoPlayerImportRow, GoPlayerSource } from "@/lib/data/types";

export interface ParsedWorkbook {
  rows: GoPlayerImportRow[];
  skipped: number;
}

/** SheetJS is ~465 KB and only the two admin workbook paths below touch it.
 *  A static `import * as XLSX` here dragged all of it into the shared
 *  root-layout chunk of EVERY route — because this module also exports
 *  normalizeThaiName, which the mock data layer and the public participants
 *  list import. Load it on demand instead; one module-level promise so the
 *  second call reuses the already-fetched chunk. The `import type` above is
 *  erased at compile time and costs nothing. */
type SheetJs = typeof import("xlsx");
let xlsxPromise: Promise<SheetJs> | null = null;
function loadXlsx(): Promise<SheetJs> {
  xlsxPromise ??= import("xlsx");
  return xlsxPromise;
}

const REQUIRED: Record<GoPlayerSource, string[]> = {
  dan: ["firstname", "lastname", "rank"],
  kyu: ["firstname", "lastname", "rank"],
  award: ["firstname", "lastname", "rank_in_category", "rank_award"],
};

// ── Thai name normalization (mirrors normalize_thai_name SQL) ───────────────
export function normalizeThaiName(name: string): string {
  return (name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[ศษ]/g, "ส")
    .replace(/ณ/g, "น")
    .replace(/ญ/g, "ย")
    .replace(/ภ/g, "พ")
    .replace(/ฎ/g, "ด")
    .replace(/ฏ/g, "ต")
    .replace(/ฑ/g, "ท")
    .replace(/ใ/g, "ไ")
    .replace(/์/g, "");
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Integer-or-null — for integer DB columns. Rejects fractional values (e.g. a
 *  stray date serial) so they can never reach an `integer` column. */
function intOrNull(value: unknown): number | null {
  const n = num(value);
  return n != null && Number.isInteger(n) ? n : null;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s || s === "#VALUE!" || s === "[object Object]") return null;
  return s;
}

/** Local date-only, NOT toISOString(): SheetJS parses date cells at local
 *  midnight, so the UTC ISO form lands on the previous day (TH is UTC+7). */
function isoLocalDate(value: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${p(value.getMonth() + 1)}-${p(value.getDate())}`;
}

/** The KYU sheet's own date column — decorative on that source (nothing keys
 *  off it), so it is kept in whatever shape the sheet holds. */
function dateStr(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoLocalDate(value);
  }
  return str(value);
}

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** The master sheet's event_date shape — "Aug 9, 2026", or "Feb 21-22, 2026"
 *  for a two-day event. ISO dates are reshaped into it; anything already free
 *  text (legacy rows, ranges) passes through untouched.
 *
 *  Matching the corpus is not cosmetic. event_date is free text and half of two
 *  keys: the (event_name, event_date, rank_in_category) key admin_append_award_rows
 *  replaces rows by, and the `event_name || event_date` distinct-event key the
 *  1-kyu award ceiling counts by. Every one of the 1,220 award rows in the
 *  database is written this way and NONE is ISO, so a single ISO row splits one
 *  real event into two — re-imports duplicate its medals instead of replacing
 *  them, and a two-event medallist is counted as three and auto-banned from
 *  registering. */
export function toMasterSheetDate(value: string): string {
  const v = value.trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return v;
  const month = MONTHS_EN[Number(iso[2]) - 1];
  return month ? `${month} ${Number(iso[3])}, ${iso[1]}` : v;
}

/** event_date for an AWARD row, normalised at this one boundary — both the
 *  .xlsx path (where SheetJS hands us a Date) and the Google-Sheets CSV path
 *  (where the same cell arrives as text) pass through here. */
function awardEventDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toMasterSheetDate(isoLocalDate(value));
  }
  const s = str(value);
  return s == null ? null : toMasterSheetDate(s);
}

// ── rank → power_level (scale: 15 kyu = 0 … 1 kyu = 14, 1 dan = 15 … 8 dan = 22) ──
function danRank(value: unknown): { rank: string; power: number } | null {
  const n = num(value);
  if (!n || !Number.isInteger(n) || n < 1) return null;
  const dan = Math.min(8, n); // dan is capped at 8
  return { rank: `${dan} Dan`, power: 14 + dan };
}

function kyuRank(value: unknown): { rank: string; power: number } | null {
  const raw = num(value);
  if (!raw || !Number.isInteger(raw) || raw < 1) return null;
  const kyu = Math.min(15, raw); // anything weaker than 15 kyu → 15 kyu
  return { rank: `${kyu} Kyu`, power: 15 - kyu };
}

// Award board-size categories aren't real ranks — winning one (1st/2nd/3rd) just
// nudges a beginner one step above the 15-kyu floor.
const awardBoardRank = new Map<string, { rank: string; power: number }>([
  ["9x9", { rank: "14 Kyu", power: 1 }],
  ["13x13", { rank: "13 Kyu", power: 2 }],
]);

export function awardKyu(value: unknown): { rank: string; power: number } | null {
  const s = str(value);
  if (!s) return null;
  const normalized = s.replace(/\s+/g, "").toLowerCase();
  const board = awardBoardRank.get(normalized);
  if (board) return board;
  // Other categories: medalling promotes one kyu above the category's strong end.
  // `best` is the category's strongest kyu as written on the master sheet.
  // Weaker than 15 kyu is clamped to 15 (a "20 Kyu" beginners' category is a
  // real thing people write), but anything below 1 kyu is not a rank at all —
  // and it used to clamp UPWARD to 1 Kyu, the single strongest kyu there is and
  // the exact rank the server-side award ceiling watches, so a "0 Kyu" typo
  // could hand a beginner the rank that blocks them from registering.
  const ease = (best: number) =>
    best >= 1 ? Math.min(15, Math.max(1, best - 1)) : null;
  let kyu: number | null = null;
  const range = s.match(/^(\d+)\s*-\s*(\d+)(?:\s*Kyu)?$/i);
  if (range) kyu = ease(Math.min(Number(range[1]), Number(range[2])));
  else {
    const single = s.match(/^(\d+)\s*Kyu$/i);
    if (single) kyu = ease(Number(single[1]));
  }
  if (kyu == null) return null;
  const capped = Math.min(15, Math.max(1, kyu));
  return { rank: `${capped} Kyu`, power: 15 - capped };
}

// ── workbook parsing ────────────────────────────────────────────────────────
function sheetToRows(
  XLSX: SheetJs,
  ws: WorkSheet | undefined,
): Record<string, unknown>[] {
  if (!ws) throw new Error("ไฟล์ไม่มีชีตข้อมูล");
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: null,
    raw: true,
  });
  // normalize header keys to trimmed-lowercase for tolerant access
  return raw.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k.trim().toLowerCase()] = v;
    }
    return out;
  });
}

async function readRows(buffer: ArrayBuffer): Promise<Record<string, unknown>[]> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  return sheetToRows(XLSX, wb.Sheets[wb.SheetNames[0]]);
}

/** Parse CSV text (e.g. fetched from a published Google Sheet) into rows.
 *  `cellDates: true` matches the Excel path so date-looking cells become Date
 *  objects (→ num() yields null) instead of raw serial numbers that would crash
 *  an integer column like year_promoted. */
async function readRowsFromCsv(text: string): Promise<Record<string, unknown>[]> {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(text, { type: "string", cellDates: true });
  return sheetToRows(XLSX, wb.Sheets[wb.SheetNames[0]]);
}

function baseRow(
  r: Record<string, unknown>,
): Pick<
  GoPlayerImportRow,
  | "seq"
  | "prefix_th"
  | "first_name_th"
  | "last_name_th"
  | "first_name_th_normalized"
  | "last_name_th_normalized"
> | null {
  const first = str(r.firstname);
  const last = str(r.lastname);
  if (!first || !last) return null;
  return {
    seq: str(r.seq),
    prefix_th: str(r.prefix),
    first_name_th: first,
    last_name_th: last,
    first_name_th_normalized: normalizeThaiName(first),
    last_name_th_normalized: normalizeThaiName(last),
  };
}

export async function parseGoDatabaseExcel(
  source: GoPlayerSource,
  file: File,
): Promise<ParsedWorkbook> {
  return parseRows(source, await readRows(await file.arrayBuffer()));
}

/** Same parsing/mapping as the Excel path, but from CSV text (Google Sheets sync). */
export async function parseGoDatabaseCsv(
  source: GoPlayerSource,
  csvText: string,
): Promise<ParsedWorkbook> {
  return parseRows(source, await readRowsFromCsv(csvText));
}

function parseRows(
  source: GoPlayerSource,
  rows: Record<string, unknown>[],
): ParsedWorkbook {
  if (rows.length === 0) return { rows: [], skipped: 0 };

  const headers = new Set(Object.keys(rows[0]));
  const missing = REQUIRED[source].filter((c) => !headers.has(c));
  if (missing.length > 0) {
    throw new Error(`ไฟล์ ${source.toUpperCase()} ขาดคอลัมน์: ${missing.join(", ")}`);
  }

  const out: GoPlayerImportRow[] = [];
  let skipped = 0;

  if (source === "dan") {
    for (const r of rows) {
      const base = baseRow(r);
      const rk = danRank(r.rank);
      if (!base || !rk) {
        skipped++;
        continue;
      }
      out.push({
        ...base,
        rank: rk.rank,
        power_level: rk.power,
        rating: num(r.gat),
        year_promoted: intOrNull(r.year),
        diamond: str(r.diamond),
        category: null,
        rank_in_category: null,
        rank_award: null,
        event_name: null,
        event_date: null,
        raw_data: r,
      });
    }
  } else if (source === "kyu") {
    const byName = new Map<string, GoPlayerImportRow>();
    for (const r of rows) {
      const base = baseRow(r);
      const rk = kyuRank(r.rank);
      if (!base || !rk) {
        skipped++;
        continue;
      }
      const row: GoPlayerImportRow = {
        ...base,
        rank: rk.rank,
        power_level: rk.power,
        rating: null,
        year_promoted: null,
        diamond: null,
        category: null,
        rank_in_category: null,
        rank_award: null,
        event_name: null,
        event_date: dateStr(r.date),
        raw_data: r,
      };
      const key = `${row.first_name_th_normalized}|${row.last_name_th_normalized}`;
      const cur = byName.get(key);
      if (!cur || row.power_level > cur.power_level) byName.set(key, row);
    }
    out.push(...byName.values());
  } else {
    for (const r of rows) {
      const base = baseRow(r);
      const award = num(r.rank_award);
      // 1..10 (not just the podium): /admin/awards can record deeper places,
      // and its master-sheet export must survive the replace-all re-sync here.
      if (!base || !award || !Number.isInteger(award) || award < 1 || award > 10) {
        skipped++;
        continue;
      }
      const rk = awardKyu(r.rank_in_category);
      if (!rk) {
        skipped++;
        continue;
      }
      out.push({
        ...base,
        rank: rk.rank,
        power_level: rk.power,
        rating: null,
        year_promoted: null,
        diamond: null,
        category: str(r.category),
        rank_in_category: str(r.rank_in_category),
        rank_award: award,
        event_name: str(r.event_name),
        event_date: awardEventDate(r.date),
        raw_data: {
          ...r,
          phone: str(r.phone),
          organizer: str(r.organizer),
        },
      });
    }
  }

  return { rows: out, skipped };
}
