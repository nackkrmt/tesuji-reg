// Live competition (ผลการจับคู่) domain — deliberately kept OUT of the big
// registration DataLayer contract. It mirrors the tesuji-v1 shape so the legacy
// clients and the MacMahon-TESUJI .jar can share the same Supabase backend.

export interface LiveDivision {
  id: string; // text id, e.g. "1-2_Kyu" (created by MacMahon export)
  name: string;
  sortOrder: number;
}

export interface LiveMatch {
  id: string;
  divisionId: string;
  round: string;
  table: string;
  black: string;
  white: string;
  blackForce: string;
  whiteForce: string;
  result: string; // "1-0" | "0-1" | "?-?" | free text
  remark: string;
  checkIn: string;
  absent: string; // "" | "B" | "W" | "BOTH" — ไม่มา (no-show), exclusive with checkIn per side
  submittedBy: string;
  isForced: boolean; // blackForce or whiteForce set
}

export interface LiveStanding {
  divisionId: string;
  headers: string[];
  rows: string[][];
  updatedAt: string | null; // wall list is overwritten per round — freshness matters
}

export interface JudgeInfo {
  accountId: string;
  email: string;
  firstNameTh: string | null;
  defaultDivisionId: string | null;
}

/** Current state of the site-wide announcement banner (live_config.announcement). */
export interface LiveAnnouncement {
  text: string;
  urgent: boolean; // red "ด่วน" styling on /live + /judge
  updatedAt: string | null; // live_config.updated_at — shown as "ประกาศเมื่อ HH:MM"
}

/** live_config.announcement is jsonb — historically a bare string, now
 *  {text, urgent}. Accept both so old rows keep rendering. */
export function parseAnnouncementValue(value: unknown): { text: string; urgent: boolean } {
  if (typeof value === "string") return { text: value, urgent: false };
  if (value && typeof value === "object") {
    const v = value as { text?: unknown; urgent?: unknown };
    return { text: typeof v.text === "string" ? v.text : "", urgent: v.urgent === true };
  }
  return { text: "", urgent: false };
}

export const RESULT_PENDING = "?-?";

/** A row is "done" once it carries a real score (not the pending sentinel). */
export function isResultDecided(result: string): boolean {
  return !!result && result !== RESULT_PENDING;
}

/** Rounds present in a division's matches, newest (highest number) first. */
export function roundsOf(matches: LiveMatch[]): string[] {
  const set = new Set(matches.map((m) => m.round).filter(Boolean));
  return [...set].sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    return Number.isNaN(na) || Number.isNaN(nb) ? b.localeCompare(a) : nb - na;
  });
}
