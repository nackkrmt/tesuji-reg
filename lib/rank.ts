// Go skill scale (ported from the tesuji-go-organizer system) → a single
// comparable integer "power_level" (higher = stronger). Absolute beginners are
// graded by board size (9x9, 13x13) below the kyu ladder; 19x19 is the normal
// board implied from 15 kyu upward. Kyu is capped at 15.
//   9x9 = 0, 13x13 = 1, 15 kyu = 2 … 1 kyu = 16, 1 dan = 17 … 9 dan = 25.

export type RankKind = "board" | "kyu" | "dan";

export interface RankEntry {
  power: number; // power_level — the comparison key (0..25)
  kind: RankKind;
  number: number | null; // kyu/dan number; null for board
  th: string;
  en: string;
}

function buildRanks(): RankEntry[] {
  const list: RankEntry[] = [
    { power: 0, kind: "board", number: null, th: "9×9 (กระดานเล็ก)", en: "9x9" },
    { power: 1, kind: "board", number: null, th: "13×13 (กระดานกลาง)", en: "13x13" },
  ];
  for (let k = 15; k >= 1; k--) {
    list.push({ power: 17 - k, kind: "kyu", number: k, th: `${k} คิว`, en: `${k} Kyu` });
  }
  for (let d = 1; d <= 9; d++) {
    list.push({ power: 16 + d, kind: "dan", number: d, th: `${d} ดั้ง`, en: `${d} Dan` });
  }
  return list;
}

export const RANKS: RankEntry[] = buildRanks(); // weak → strong (power 0..25)
export const RANK_BY_POWER = new Map(RANKS.map((r) => [r.power, r]));

export const MIN_POWER = 0;
export const MAX_POWER = 25;

export function rankByPower(p: number | null | undefined): RankEntry | null {
  return p == null ? null : RANK_BY_POWER.get(p) ?? null;
}

/** Thai label for a power_level (for display). */
export function powerToLabel(p: number | null | undefined): string {
  return rankByPower(p)?.th ?? "ไม่ระบุระดับ";
}

/** Parse a rank string ("9x9", "13x13", "N Kyu", "N Dan") → power_level.
 *  Used when importing the DAN/KYU/AWARD databases. Kyu is capped at 15. */
export function rankToPowerLevel(rank: string): number | null {
  const trimmed = rank.trim();
  if (trimmed === "9x9" || trimmed === "9×9") return 0;
  if (trimmed === "13x13" || trimmed === "13×13") return 1;
  const kyu = trimmed.match(/^(\d+)\s*(?:Kyu|คิว)$/i);
  if (kyu) {
    const n = Math.min(15, Math.max(1, Number(kyu[1])));
    return 17 - n;
  }
  const dan = trimmed.match(/^(\d+)\s*(?:Dan|ดั้ง)$/i);
  if (dan) {
    const n = Number(dan[1]);
    return n >= 1 && n <= 9 ? 16 + n : null;
  }
  return null;
}

/** Options for the person rank <Select> (required — no "ไม่จำกัด"). value = String(power). */
export const RANK_OPTIONS = RANKS.map((r) => ({
  value: String(r.power),
  label: r.th,
}));

/** Options for admin min/max bound <Select> — leading "ไม่จำกัด" (value "") = null. */
export const RANK_BOUND_OPTIONS = [
  { value: "", label: "ไม่จำกัด" },
  ...RANK_OPTIONS,
];

/**
 * Eligibility test — the single source of truth, mirrored by the SQL reserve_seats.
 * open division (both null) → anyone; bounded + null power → caller treats as RANK_REQUIRED.
 */
export function isRankEligible(
  power: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): boolean {
  if (min == null && max == null) return true; // open
  if (power == null) return false; // bounded needs a declared rank
  if (min != null && power < min) return false;
  if (max != null && power > max) return false;
  return true;
}

/** Human description of a division's accepted band, e.g. "ไม่เกิน 10 คิว" / "รับทุกระดับ". */
export function bandLabel(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min == null && max == null) return "รับทุกระดับ";
  if (min != null && max != null) {
    return min === max
      ? `เฉพาะ ${powerToLabel(min)}`
      : `${powerToLabel(min)} – ${powerToLabel(max)}`;
  }
  if (max != null) return `ไม่เกิน ${powerToLabel(max)}`;
  return `${powerToLabel(min)} ขึ้นไป`;
}
