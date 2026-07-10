// Rules (กฎ กติกา) helpers — serialization for the rules_text carrier column.
// Model: กฎ กติกา แบ่งเป็นหัวข้อ — each RulesSection is a heading with its
// ordered items, auto-numbered 1. 2. 3. on the public page.

import { RulesSection } from "@/lib/data/types";

/** Encode rules sections for storage in the tournament's text column. */
export function serializeRulesSections(sections: RulesSection[]): string {
  return JSON.stringify(sections ?? []);
}

/** True for an http(s) or data: URL — detects a legacy rules-PDF link left in
 *  the rules_text carrier by the removed PDF-upload feature. */
export function isHttpOrDataUrl(raw: string | null | undefined): boolean {
  return !!raw && /^(https?:|data:)/i.test(raw);
}

/** Decode the rules column back to sections. Legacy payloads — a PDF URL from
 *  the old upload feature, or plain text — parse to [] so the public page
 *  shows its empty state until the admin re-enters the rules. */
export function parseRulesSections(
  raw: string | null | undefined,
): RulesSection[] {
  if (!raw || isHttpOrDataUrl(raw)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(coerceSection)
    .filter((s): s is RulesSection => s !== null);
}

function coerceSection(x: unknown): RulesSection | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const items = (Array.isArray(o.items) ? o.items : [])
    .filter((i): i is string => typeof i === "string")
    // Keep leading tabs/spaces — they carry the sub-item indentation; only drop
    // trailing whitespace and fully-blank lines.
    .map((i) => i.replace(/\s+$/, ""))
    .filter((i) => i.trim().length > 0);
  if (!title && items.length === 0) return null;
  return { title, items };
}
