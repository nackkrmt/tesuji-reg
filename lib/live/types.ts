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
  submittedBy: string;
  isForced: boolean; // blackForce or whiteForce set
}

export interface LiveStanding {
  divisionId: string;
  headers: string[];
  rows: string[][];
}

export interface JudgeInfo {
  accountId: string;
  email: string;
  firstNameTh: string | null;
  defaultDivisionId: string | null;
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
