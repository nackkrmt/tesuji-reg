// Rules (กฎ กติกา) helpers — serialization for the rules_text carrier column.
// Model: กฎ กติกา แบ่งเป็นหัวข้อ — each RulesSection is a title with its
// ordered content blocks, authored in the admin block editor and rendered
// as-is on the public page.

import { RULES_BLOCK_TYPES, RulesBlock, RulesSection } from "@/lib/data/types";

const MAX_BLOCKS_PER_SECTION = 60;
const MAX_TABLE_ROWS = 200;
const MAX_TABLE_COLS = 20;
const MAX_TEXT_LEN = 5000;
const MAX_LIST_ITEMS = 300;

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
  const blocks = (Array.isArray(o.blocks) ? o.blocks : [])
    .map(coerceBlock)
    .filter((b): b is RulesBlock => b !== null)
    .slice(0, MAX_BLOCKS_PER_SECTION);

  // Legacy rows (pre-block-editor): kept read-only as a fallback so a section
  // not yet re-authored with blocks still shows something on the public page.
  const items = blocks.length === 0
    ? (Array.isArray(o.items) ? o.items : [])
        .filter((i): i is string => typeof i === "string")
        .map((i) => i.replace(/\s+$/, ""))
        .filter((i) => i.trim().length > 0)
    : [];

  if (!title && blocks.length === 0 && items.length === 0) return null;
  return items.length > 0 ? { title, blocks, items } : { title, blocks };
}

const text = (v: unknown) =>
  (typeof v === "string" ? v : "").slice(0, MAX_TEXT_LEN);

function isRulesBlockType(t: string): t is RulesBlock["type"] {
  return (RULES_BLOCK_TYPES as string[]).includes(t);
}

function coerceBlock(x: unknown): RulesBlock | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const type = o.type;
  if (typeof type !== "string" || !isRulesBlockType(type)) return null;
  switch (type) {
    case "heading":
      return { type: "heading", text: text(o.text) };
    case "paragraph":
      return { type: "paragraph", text: text(o.text) };
    case "divider":
      return { type: "divider" };
    case "callout":
      return {
        type: "callout",
        tone: o.tone === "warn" ? "warn" : "info",
        text: text(o.text),
      };
    case "list":
      return {
        type: "list",
        ordered: o.ordered === true,
        items: (Array.isArray(o.items) ? o.items : [])
          .slice(0, MAX_LIST_ITEMS)
          .map((it) => {
            if (!it || typeof it !== "object") return { text: "", depth: 0 };
            const io = it as Record<string, unknown>;
            const depth =
              typeof io.depth === "number" ? Math.min(Math.max(Math.trunc(io.depth), 0), 6) : 0;
            return { text: text(io.text), depth };
          })
          .filter((it) => it.text.length > 0),
      };
    case "table": {
      const rawRows = Array.isArray(o.rows) ? o.rows : [];
      const rows = rawRows.slice(0, MAX_TABLE_ROWS).map((r) =>
        (Array.isArray(r) ? r : [])
          .slice(0, MAX_TABLE_COLS)
          .map((c) => text(c)),
      );
      return { type: "table", hasHeader: o.hasHeader === true, rows };
    }
    default:
      return null;
  }
}
