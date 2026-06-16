// Parse the DAN / KYU / AWARD Excel databases into go_player_database rows.
// Column mappings + power-level rules mirror the tesuji-go-organizer system.

import * as XLSX from "xlsx";
import { GoPlayerImportRow, GoPlayerSource } from "@/lib/data/types";

export interface ParsedWorkbook {
  rows: GoPlayerImportRow[];
  skipped: number;
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

function dateStr(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return str(value);
}

// ── rank → power_level ──────────────────────────────────────────────────────
function danRank(value: unknown): { rank: string; power: number } | null {
  const n = num(value);
  if (!n || !Number.isInteger(n) || n < 1 || n > 9) return null;
  return { rank: `${n} Dan`, power: 16 + n };
}

function kyuRank(value: unknown): { rank: string; power: number } | null {
  const raw = num(value);
  if (!raw || !Number.isInteger(raw) || raw < 1) return null;
  const kyu = raw >= 16 ? 15 : raw;
  return { rank: `${kyu} Kyu`, power: 17 - kyu };
}

const awardBoardToKyu = new Map<string, number>([
  ["9x9", 12],
  ["13x13", 12],
]);

function awardKyu(value: unknown): { rank: string; power: number } | null {
  const s = str(value);
  if (!s) return null;
  const normalized = s.replace(/\s+/g, "").toLowerCase();
  const ease = (best: number) => Math.min(15, Math.max(1, best - 1));
  let kyu: number | null = awardBoardToKyu.get(normalized) ?? null;
  if (kyu == null) {
    const range = s.match(/^(\d+)\s*-\s*(\d+)(?:\s*Kyu)?$/i);
    if (range) kyu = ease(Math.min(Number(range[1]), Number(range[2])));
    else {
      const single = s.match(/^(\d+)\s*Kyu$/i);
      if (single) kyu = ease(Number(single[1]));
    }
  }
  if (kyu == null) return null;
  const capped = Math.min(15, Math.max(1, kyu));
  return { rank: `${capped} Kyu`, power: 17 - capped };
}

// ── workbook parsing ────────────────────────────────────────────────────────
function sheetToRows(ws: XLSX.WorkSheet | undefined): Record<string, unknown>[] {
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

function readRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  return sheetToRows(wb.Sheets[wb.SheetNames[0]]);
}

/** Parse CSV text (e.g. fetched from a published Google Sheet) into rows.
 *  `cellDates: true` matches the Excel path so date-looking cells become Date
 *  objects (→ num() yields null) instead of raw serial numbers that would crash
 *  an integer column like year_promoted. */
function readRowsFromCsv(text: string): Record<string, unknown>[] {
  const wb = XLSX.read(text, { type: "string", cellDates: true });
  return sheetToRows(wb.Sheets[wb.SheetNames[0]]);
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
  return parseRows(source, readRows(await file.arrayBuffer()));
}

/** Same parsing/mapping as the Excel path, but from CSV text (Google Sheets sync). */
export function parseGoDatabaseCsv(
  source: GoPlayerSource,
  csvText: string,
): ParsedWorkbook {
  return parseRows(source, readRowsFromCsv(csvText));
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
      if (!base || !award || ![1, 2, 3].includes(award)) {
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
        event_date: dateStr(r.date),
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
