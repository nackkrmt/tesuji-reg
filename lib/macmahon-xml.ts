// Parse a MacMahon 3.x tournament .xml (one file = one division) and compute
// final standings. Used by /admin/awards to turn the organizer's MacMahon save
// files into award-database rows.
//
// Browser-only: relies on DOMParser (no dependency needed). The files round-trip
// our own export — lib/export.ts sends "<firstNameTh> <lastNameTh>||35K" per
// player, so <Surname> holds the FULL Thai name and every entrant is 35k with
// rating 0, which makes MacMahon behave as plain Swiss: final order is
// Points → SOS → SOSOS, exactly the file's own Walllist sort criteria.

import { awardKyu } from "@/lib/go-database";

export interface MacmahonPlayer {
  id: number;
  fullName: string;
}

export interface MacmahonPairing {
  round: number;
  black: number | null;
  white: number | null;
  /** "1-0" (black won) | "0-1" (white won) | "0-0" (no result / double loss) |
   *  anything else (unknown / unplayed). */
  result: string;
  bye: boolean;
  forced: boolean;
}

export interface StandingRow {
  playerId: number;
  fullName: string;
  points: number;
  sos: number;
  sosos: number;
  /** 1-based position after sorting desc by (points, sos, sosos). */
  place: number;
  /** Exact (points, sos, sosos) tie with the row below — the admin must break it. */
  tiedWithNext: boolean;
  /** The organizer's fake odd-man entrant ("ไม่มีผู้เข้าแข่งขัน") — kept in the
   *  table so scores mirror MacMahon's own wall list, but never awardable. */
  placeholder: boolean;
}

/** Fake entrant MacMahon organizers add for an odd player count — same
 *  convention as BYE_NAME on the live board. */
export const MM_BYE_NAME = "ไม่มีผู้เข้าแข่งขัน";

export interface ParsedDivision {
  /** <Name> content, e.g. "03 - 9-12 Kyu"; falls back to the filename. */
  divisionName: string;
  fileName: string;
  numberOfRounds: number;
  players: MacmahonPlayer[];
  pairings: MacmahonPairing[];
  standings: StandingRow[];
  warnings: string[];
}

function text(parent: Element, tag: string): string {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tag) return (child.textContent ?? "").trim();
  }
  return "";
}

function intOf(parent: Element, tag: string): number | null {
  const s = text(parent, tag);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "03 - 9-12 Kyu" → "9-12 Kyu" — the part awardKyu()/category names understand.
 *  A name that is ALREADY a bare category is returned untouched: stripping
 *  first would turn "9-12 Kyu" into "12 Kyu" (the dash of the range is
 *  indistinguishable from the ordering prefix's dash) and silently derive the
 *  wrong rank. */
export function divisionLabel(divisionName: string): string {
  const name = divisionName.trim();
  if (awardKyu(name)) return name;
  return name.replace(/^\s*\d+\s*[-–]\s*/, "").trim() || name;
}

/** Split a MacMahon full name back into first/last. Our export composed it as
 *  `${firstNameTh} ${lastNameTh}` (no middle name), so the first space is the
 *  boundary; names typed inside MacMahon may deviate — callers should prefer a
 *  registration-seat match and treat this as the fallback. */
export function splitThaiFullName(fullName: string): {
  firstName: string;
  lastName: string;
  ambiguous: boolean;
} {
  const clean = fullName.trim().replace(/\s+/g, " ");
  const idx = clean.indexOf(" ");
  if (idx < 0) return { firstName: clean, lastName: "", ambiguous: true };
  const firstName = clean.slice(0, idx);
  const lastName = clean.slice(idx + 1);
  return { firstName, lastName, ambiguous: lastName.includes(" ") };
}

export function parseMacmahonXml(fileName: string, xmlText: string): ParsedDivision {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  // DOMParser never throws — malformed XML surfaces as a <parsererror> node.
  if (doc.querySelector("parsererror")) {
    throw new Error(`ไฟล์ XML ไม่ถูกต้อง: ${fileName}`);
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== "Tournament") {
    throw new Error(`ไฟล์ไม่ใช่ MacMahon XML (ไม่มี <Tournament>): ${fileName}`);
  }

  const warnings: string[] = [];
  const divisionName =
    text(root, "Name") || fileName.replace(/\.xml$/i, "").trim();
  const numberOfRounds = intOf(root, "NumberOfRounds") ?? 0;

  // ── players ────────────────────────────────────────────────────────────────
  const players: MacmahonPlayer[] = [];
  const byId = new Map<number, MacmahonPlayer>();
  const nameCount = new Map<string, number>();
  for (const el of Array.from(root.children)) {
    if (el.tagName !== "IndividualParticipant") continue;
    const id = intOf(el, "Id");
    let fullName = "";
    for (const child of Array.from(el.children)) {
      if (child.tagName === "GoPlayer") fullName = text(child, "Surname");
    }
    fullName = fullName.replace(/\s+/g, " ").trim();
    if (id == null || !fullName) {
      warnings.push(`ข้ามผู้เล่นที่ข้อมูลไม่ครบ (Id ${id ?? "?"})`);
      continue;
    }
    const p = { id, fullName };
    players.push(p);
    byId.set(id, p);
    nameCount.set(fullName, (nameCount.get(fullName) ?? 0) + 1);
  }
  for (const [name, count] of nameCount) {
    if (count > 1) warnings.push(`ชื่อ “${name}” ซ้ำกัน ${count} คนในไฟล์ — ตรวจสอบก่อนบันทึก`);
  }
  if (players.length === 0) {
    throw new Error(`ไฟล์ไม่มีรายชื่อผู้เล่น: ${fileName}`);
  }

  // ── pairings ───────────────────────────────────────────────────────────────
  const pairings: MacmahonPairing[] = [];
  for (const roundEl of Array.from(root.children)) {
    if (roundEl.tagName !== "TournamentRound") continue;
    const round = intOf(roundEl, "RoundNumber") ?? 0;
    for (const el of Array.from(roundEl.children)) {
      if (el.tagName !== "Pairing") continue;
      pairings.push({
        round,
        black: intOf(el, "Black"),
        white: intOf(el, "White"),
        result: text(el, "Result"),
        bye: text(el, "PairingWithBye") === "true",
        forced: text(el, "ForcedPairing") === "true",
      });
    }
  }

  // ── standings: Points → SOS → SOSOS ────────────────────────────────────────
  const points = new Map<number, number>();
  const opponents = new Map<number, (number | "bye")[]>();
  for (const p of players) {
    points.set(p.id, 0);
    opponents.set(p.id, []);
  }
  const has = (id: number | null): id is number => id != null && byId.has(id);

  for (const g of pairings) {
    if (g.bye) {
      // MacMahon bye = free win. For SOS the bye counts as an opponent with the
      // player's own score (EGF convention). No current file has byes — kept
      // defensive, surfaced as a warning so the admin double-checks.
      const beneficiary = has(g.black) ? g.black : has(g.white) ? g.white : null;
      if (beneficiary != null) {
        points.set(beneficiary, (points.get(beneficiary) ?? 0) + 1);
        opponents.get(beneficiary)!.push("bye");
        warnings.push(
          `รอบ ${g.round}: ${byId.get(beneficiary)!.fullName} ได้บาย (+1 คะแนน)`,
        );
      }
      continue;
    }
    if (!has(g.black) || !has(g.white)) {
      warnings.push(`รอบ ${g.round}: คู่แข่งอ้างถึงผู้เล่นที่ไม่มีในไฟล์ — ข้าม`);
      continue;
    }
    opponents.get(g.black)!.push(g.white);
    opponents.get(g.white)!.push(g.black);
    if (g.result === "1-0") {
      points.set(g.black, points.get(g.black)! + 1);
    } else if (g.result === "0-1") {
      points.set(g.white, points.get(g.white)! + 1);
    } else if (g.result === "0-0") {
      warnings.push(
        `รอบ ${g.round}: ${byId.get(g.black)!.fullName} – ${byId.get(g.white)!.fullName} ผล 0-0 (ไม่มีผู้ชนะ)`,
      );
    } else {
      warnings.push(
        `รอบ ${g.round}: ${byId.get(g.black)!.fullName} – ${byId.get(g.white)!.fullName} ไม่มีผลการแข่งขัน${g.result ? ` (“${g.result}”)` : ""}`,
      );
    }
  }

  const sos = new Map<number, number>();
  for (const p of players) {
    sos.set(
      p.id,
      opponents
        .get(p.id)!
        .reduce<number>(
          (sum, o) => sum + (o === "bye" ? points.get(p.id)! : points.get(o)!),
          0,
        ),
    );
  }
  const sosos = new Map<number, number>();
  for (const p of players) {
    sosos.set(
      p.id,
      opponents
        .get(p.id)!
        .reduce<number>(
          (sum, o) => sum + (o === "bye" ? sos.get(p.id)! : sos.get(o)!),
          0,
        ),
    );
  }

  for (const p of players) {
    if (opponents.get(p.id)!.length === 0) {
      warnings.push(`${p.fullName} ไม่มีคู่แข่งขันเลย (อาจถอนตัวก่อนเริ่ม)`);
    }
  }

  if (players.some((p) => p.fullName === MM_BYE_NAME)) {
    warnings.push(
      `ไฟล์มีผู้เล่นตัวแทน “${MM_BYE_NAME}” — แสดงในตารางแต่จะไม่ถูกเลือกเป็นผู้ได้รางวัล`,
    );
  }

  // A save taken mid-tournament contains only the rounds played so far, with
  // every existing result complete — nothing else would flag it.
  const roundsSeen = new Set(pairings.map((g) => g.round)).size;
  if (numberOfRounds > 0 && roundsSeen < numberOfRounds) {
    warnings.push(
      `ไฟล์มีผลเพียง ${roundsSeen} จาก ${numberOfRounds} รอบ — อาจเป็นไฟล์ที่บันทึกไว้กลางการแข่งขัน ตรวจสอบว่าเป็นไฟล์สุดท้ายจริง`,
    );
  }

  const standings: StandingRow[] = players
    .map((p) => ({
      playerId: p.id,
      fullName: p.fullName,
      points: points.get(p.id)!,
      sos: sos.get(p.id)!,
      sosos: sosos.get(p.id)!,
      place: 0,
      tiedWithNext: false,
      placeholder: p.fullName === MM_BYE_NAME,
    }))
    .sort(
      (a, b) => b.points - a.points || b.sos - a.sos || b.sosos - a.sosos,
    );
  standings.forEach((row, i) => {
    row.place = i + 1;
    const next = standings[i + 1];
    row.tiedWithNext =
      !!next &&
      next.points === row.points &&
      next.sos === row.sos &&
      next.sosos === row.sosos;
  });

  return {
    divisionName,
    fileName,
    numberOfRounds,
    players,
    pairings,
    standings,
    warnings,
  };
}
