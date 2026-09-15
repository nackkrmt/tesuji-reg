// Admin export builders — pure (no DOM). Two shapes:
//   - a full, well-formed CSV of every participant (one row per person) for
//     record-keeping;
//   - per-รุ่น MacMahon-import text files ("รหัส_ชื่อรุ่น_MMImport.txt"), each
//     line "<ชื่อ> <นามสกุล> || <rank>".
// The component layer turns these into downloads (CSV blob / zipped TXT).

import {
  BatchWithSeats,
  Category,
  REGISTRATION_STATUS_LABEL,
  RegistrationSeat,
} from "@/lib/data/types";
import { rankByPower } from "@/lib/rank";
import { ageFromDob } from "@/lib/age";
import { fullNameTh } from "@/lib/utils";

export interface TxtFile {
  filename: string;
  content: string;
}

/** Strip characters illegal in file / zip-entry names. Keeps Thai, spaces, and
 *  hyphens so a รุ่น name like "1-2 Kyu" survives intact.
 *  \p{M} is not optional: Thai vowel and tone marks are combining marks, not
 *  letters, so without it every mark is replaced and "รุ่นทั่วไป" ships as
 *  "ร-นท-วไป". Exported because the download filenames built in the component
 *  layer carry the tournament name and need the same treatment. */
export function sanitizeFilenamePart(s: string): string {
  return (s || "")
    .replace(/[^\p{L}\p{N}\p{M} ._-]+/gu, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compact MacMahon rank token from a power_level: kyu -> "5K", dan -> "1D".
 *  Null power falls back to "15K" — the app's floor (unmatched -> 15 kyu). */
export function mmRankFromPower(power: number | null | undefined): string {
  const entry = rankByPower(power ?? 0) ?? rankByPower(0)!;
  return `${entry.number}${entry.kind === "kyu" ? "K" : "D"}`;
}

/** Resolved title prefix (handles the custom "อื่นๆ" case). */
function titleOf(s: RegistrationSeat): string {
  return s.titlePrefix === "อื่นๆ" ? s.titleCustom ?? "" : s.titlePrefix;
}

// one flattened person row, with its รุ่น + batch context
interface Row {
  seat: RegistrationSeat;
  batch: BatchWithSeats["batch"];
  category: Category | undefined;
}

function flatten(batches: BatchWithSeats[], cats: Category[]): Row[] {
  const catById = new Map(cats.map((c) => [c.id, c]));
  const rows: Row[] = [];
  for (const { batch, seats } of batches) {
    for (const seat of seats) {
      rows.push({ seat, batch, category: catById.get(seat.categoryId) });
    }
  }
  // Group by รุ่น (sortOrder/code), then by Thai name within a รุ่น.
  return rows.sort((a, b) => {
    const oa = a.category?.sortOrder ?? 9999;
    const ob = b.category?.sortOrder ?? 9999;
    if (oa !== ob) return oa - ob;
    const code = (a.category?.code ?? "").localeCompare(b.category?.code ?? "");
    if (code !== 0) return code;
    return fullNameTh(a.seat).localeCompare(fullNameTh(b.seat), "th");
  });
}

// ── CSV ──────────────────────────────────────────────────────────────────────
const CSV_HEADERS = [
  "ลำดับ",
  "รหัสรุ่น",
  "ชื่อรุ่น",
  "คำนำหน้า",
  "ชื่อ (ไทย)",
  "ชื่อกลาง (ไทย)",
  "นามสกุล (ไทย)",
  "ชื่อ (อังกฤษ)",
  "ชื่อกลาง (อังกฤษ)",
  "นามสกุล (อังกฤษ)",
  "เบอร์โทร",
  "วันเกิด",
  "อายุ",
  "ระดับฝีมือ",
  "ระดับ (MM)",
  "power_level",
  "จังหวัด",
  "สถาบัน",
  "PDPA",
  "สถานะใบสมัคร",
  "รหัสใบสมัคร",
  "ประเภท",
  "ค่าสมัคร (รุ่นนี้)",
  "ยอดรวมทั้งใบ",
  "เบอร์ผู้ส่งสมัคร",
  "วันที่สมัคร",
  "วันที่ตรวจสอบ",
  // Appended LAST so every existing column keeps its position for anyone with a
  // saved pivot. Without it a downloaded roster is unidentifiable once two
  // events' exports sit in the same folder.
  "รายการแข่งขัน",
];

/** Quote a CSV cell (RFC-4180): wrap in quotes, double any embedded quote.
 *  Free-text values starting with a formula trigger (= + - @ tab CR) get a
 *  leading apostrophe so Excel/Sheets render them as text instead of
 *  executing them (CSV formula injection). */
function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** A full participant CSV (UTF-8 BOM + CRLF) — one row per registered person. */
export function buildParticipantsCsv(
  batches: BatchWithSeats[],
  cats: Category[],
  tournamentName = "",
): string {
  const rows = flatten(batches, cats);
  const lines: string[] = [CSV_HEADERS.map(csvCell).join(",")];

  rows.forEach(({ seat, batch, category }, i) => {
    const age = ageFromDob(seat.dob);
    const cells: (string | number | null)[] = [
      i + 1,
      category?.code ?? "",
      category?.name ?? "",
      titleOf(seat),
      seat.firstNameTh,
      seat.hasMiddleName ? seat.middleNameTh ?? "" : "",
      seat.lastNameTh,
      seat.firstNameEn,
      seat.hasMiddleName ? seat.middleNameEn ?? "" : "",
      seat.lastNameEn,
      seat.phone,
      seat.dob,
      age ?? "",
      rankByPower(seat.powerLevel)?.th ?? "",
      mmRankFromPower(seat.powerLevel),
      seat.powerLevel ?? "",
      seat.province ?? "",
      seat.instituteName ?? "",
      seat.pdpaConsent ? "ยินยอม" : "",
      REGISTRATION_STATUS_LABEL[batch.status],
      batch.referenceCode,
      batch.kind === "group" ? "กลุ่ม" : "เดี่ยว",
      seat.feeThbSnapshot,
      batch.totalAmountThb,
      batch.submitterPhone,
      batch.createdAt,
      batch.reviewedAt ?? "",
      tournamentName,
    ];
    lines.push(cells.map(csvCell).join(","));
  });

  // U+FEFF BOM so Excel detects UTF-8; CRLF rows for spreadsheet friendliness.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// ── per-รุ่น grouping (shared by the TXT export and the printed check-in sheet) ─
export interface CategoryRoster {
  category: Category;
  /** Seats in that รุ่น, Thai-name order. Empty รุ่น are dropped. */
  seats: RegistrationSeat[];
}

/** Everyone in `batches`, bucketed into their รุ่น and ordered the way the
 *  organiser reads them: รุ่น by sortOrder then code, people by Thai name. */
export function groupByCategory(
  batches: BatchWithSeats[],
  cats: Category[],
): CategoryRoster[] {
  const seatsByCat = new Map<string, RegistrationSeat[]>();
  for (const { seats } of batches) {
    for (const seat of seats) {
      const arr = seatsByCat.get(seat.categoryId);
      if (arr) arr.push(seat);
      else seatsByCat.set(seat.categoryId, [seat]);
    }
  }

  const ordered = [...cats].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );

  const out: CategoryRoster[] = [];
  for (const category of ordered) {
    const seats = seatsByCat.get(category.id);
    if (!seats || seats.length === 0) continue;
    out.push({
      category,
      seats: seats
        .slice()
        .sort((a, b) => fullNameTh(a).localeCompare(fullNameTh(b), "th")),
    });
  }
  return out;
}

// ── per-รุ่น MM-import TXT ────────────────────────────────────────────────────
/** MacMahon import seeds every player at one fixed entry rank; the real ranks
 *  are set later inside the pairing software. Change here to adjust. */
const MM_IMPORT_RANK = "35K";

/** One TXT file per รุ่น that has at least one participant. Within a file,
 *  players are ordered strongest-first (then Thai name) for seeding.
 *
 *  `realRanks` writes each player's own verified rank token instead of the
 *  uniform 35K seed, saving the organiser ~200 hand-keyed ranks on event eve.
 *  It stays OPT-IN and off by default: 35K is what every past event imported
 *  with, and nobody has re-verified that this .jar build accepts a per-line
 *  token — an import that silently drops ranks would be discovered during
 *  pairing. */
export function buildCategoryTxtFiles(
  batches: BatchWithSeats[],
  cats: Category[],
  realRanks = false,
): TxtFile[] {
  const files: TxtFile[] = [];
  for (const { category: cat, seats } of groupByCategory(batches, cats)) {
    const lines = seats
      .slice()
      .sort(
        (a, b) =>
          (b.powerLevel ?? 0) - (a.powerLevel ?? 0) ||
          fullNameTh(a).localeCompare(fullNameTh(b), "th"),
      )
      .map(
        (s) =>
          `${s.firstNameTh} ${s.lastNameTh}||${
            realRanks ? mmRankFromPower(s.powerLevel) : MM_IMPORT_RANK
          }`,
      );

    files.push({
      filename: `${sanitizeFilenamePart(cat.code)}_${sanitizeFilenamePart(
        cat.name,
      )}_MMImport.txt`,
      content: lines.join("\r\n") + "\r\n",
    });
  }
  return files;
}
