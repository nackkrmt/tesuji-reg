// Go skill scale → a single comparable integer "power_level" (higher = stronger).
// The ladder runs from 15 kyu (the floor) up to 8 dan. Kyu is capped at 15
// (anything weaker collapses to 15 kyu) and never crosses into dan — dan ranks
// come only from the Dan database.
//   15 kyu = 0, 14 kyu = 1 … 1 kyu = 14, 1 dan = 15 … 8 dan = 22.

import type { Locale } from "@/lib/i18n/config";

export type RankKind = "kyu" | "dan";

export interface RankEntry {
  power: number; // power_level — the comparison key (0..22)
  kind: RankKind;
  number: number; // kyu/dan number
  th: string;
  en: string;
}

function buildRanks(): RankEntry[] {
  const list: RankEntry[] = [];
  for (let k = 15; k >= 1; k--) {
    list.push({ power: 15 - k, kind: "kyu", number: k, th: `${k} คิว`, en: `${k} Kyu` });
  }
  for (let d = 1; d <= 8; d++) {
    list.push({ power: 14 + d, kind: "dan", number: d, th: `${d} ดั้ง`, en: `${d} Dan` });
  }
  return list;
}

export const RANKS: RankEntry[] = buildRanks(); // weak → strong (power 0..22)
export const RANK_BY_POWER = new Map(RANKS.map((r) => [r.power, r]));

export const MIN_POWER = 0;
export const MAX_POWER = 22;

export function rankByPower(p: number | null | undefined): RankEntry | null {
  return p == null ? null : RANK_BY_POWER.get(p) ?? null;
}

/** Localized label for a power_level (for display). Defaults to Thai so callers
 *  that don't care about locale (exports, SQL-mirrors) keep the Thai text. */
export function powerToLabel(
  p: number | null | undefined,
  locale: Locale = "th",
): string {
  const r = rankByPower(p);
  if (!r) return locale === "en" ? "Unspecified" : "ไม่ระบุระดับ";
  return locale === "en" ? r.en : r.th;
}

/** Parse a rank string ("N Kyu", "N Dan") → power_level. Kyu is capped at 15
 *  (anything weaker → 15 kyu); dan is capped at 8. */
export function rankToPowerLevel(rank: string): number | null {
  const trimmed = rank.trim();
  const kyu = trimmed.match(/^(\d+)\s*(?:Kyu|คิว)$/i);
  if (kyu) {
    const n = Math.min(15, Math.max(1, Number(kyu[1])));
    return 15 - n;
  }
  const dan = trimmed.match(/^(\d+)\s*(?:Dan|ดั้ง)$/i);
  if (dan) {
    const n = Math.min(8, Math.max(1, Number(dan[1])));
    return 14 + n;
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
  locale: Locale = "th",
): string {
  const en = locale === "en";
  if (min == null && max == null) return en ? "All levels" : "รับทุกระดับ";
  if (min != null && max != null) {
    return min === max
      ? en
        ? `Only ${powerToLabel(min, locale)}`
        : `เฉพาะ ${powerToLabel(min, locale)}`
      : `${powerToLabel(min, locale)} – ${powerToLabel(max, locale)}`;
  }
  if (max != null)
    return en
      ? `Up to ${powerToLabel(max, locale)}`
      : `ไม่เกิน ${powerToLabel(max, locale)}`;
  return en
    ? `${powerToLabel(min, locale)} and up`
    : `${powerToLabel(min, locale)} ขึ้นไป`;
}
