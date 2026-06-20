// Schedule (กำหนดการ) helpers — serialization for the schedule_text carrier
// column, plus formatting used by both the admin builder and the public view.
// Model: กำหนดการ จัดกลุ่มตามรุ่น — each ScheduleGroup is a รุ่น with its own
// ordered list of timed entries (เพิ่มเวลาทีละอัน).

import {
  SCHEDULE_EVENT_TYPES,
  ScheduleEntry,
  ScheduleEventType,
  ScheduleGroup,
} from "@/lib/data/types";

/** Fresh id for a new schedule entry. */
export function newScheduleId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `sch_${Math.floor(performance.now() * 1000)}`;
  }
}

/** Encode schedule groups for storage in the tournament's text column. */
export function serializeScheduleGroups(groups: ScheduleGroup[]): string {
  return JSON.stringify(groups ?? []);
}

/** Decode the schedule column back to groups. Tolerant of the legacy flat
 *  ScheduleItem[] shape (groups them by categoryId) and of plain text. */
export function parseScheduleGroups(
  raw: string | null | undefined,
): ScheduleGroup[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return []; // legacy free-text schedule — dropped from the structured view
  }
  if (!Array.isArray(parsed)) return [];
  // Already grouped?
  if (parsed.some((x) => x && typeof x === "object" && "entries" in x)) {
    return parsed
      .map(coerceGroup)
      .filter((g): g is ScheduleGroup => g !== null);
  }
  // Legacy flat items → group by categoryId (drop items with no รุ่น).
  return groupFlatItems(parsed);
}

function coerceGroup(x: unknown): ScheduleGroup | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  // categoryIds (current) or a legacy single categoryId.
  let categoryIds: string[] = [];
  if (Array.isArray(o.categoryIds)) {
    categoryIds = o.categoryIds.filter(
      (id): id is string => typeof id === "string" && !!id,
    );
  } else if (typeof o.categoryId === "string" && o.categoryId) {
    categoryIds = [o.categoryId];
  }
  if (categoryIds.length === 0) return null;
  const rawEntries = Array.isArray(o.entries) ? o.entries : [];
  const entries = rawEntries
    .map(coerceEntry)
    .filter((e): e is ScheduleEntry => e !== null);
  return { categoryIds, entries };
}

function coerceEntry(x: unknown): ScheduleEntry | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const type = typeof o.type === "string" ? o.type : "";
  if (!SCHEDULE_EVENT_TYPES.includes(type as ScheduleEventType)) return null;
  return {
    id: typeof o.id === "string" && o.id ? o.id : newScheduleId(),
    time: typeof o.time === "string" ? o.time : "",
    type: type as ScheduleEventType,
    boardNumber:
      typeof o.boardNumber === "string" && o.boardNumber ? o.boardNumber : null,
    note: typeof o.note === "string" && o.note ? o.note : null,
  };
}

/** Convert a legacy flat ScheduleItem[] (each with its own categoryId) into
 *  grouped form, preserving first-seen รุ่น order. */
function groupFlatItems(items: unknown[]): ScheduleGroup[] {
  const order: string[] = [];
  const byCat = new Map<string, ScheduleEntry[]>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const categoryId = typeof o.categoryId === "string" ? o.categoryId : "";
    if (!categoryId) continue;
    const entry = coerceEntry(o);
    if (!entry) continue;
    if (!byCat.has(categoryId)) {
      byCat.set(categoryId, []);
      order.push(categoryId);
    }
    byCat.get(categoryId)!.push(entry);
  }
  return order.map((categoryId) => ({
    categoryIds: [categoryId],
    entries: byCat.get(categoryId)!,
  }));
}

/** True for an http(s) or data: URL — guards the rules_text carrier against
 *  legacy plain-text rules being treated as a PDF link. */
export function isHttpOrDataUrl(raw: string | null | undefined): boolean {
  return !!raw && /^(https?:|data:)/i.test(raw);
}

/** Leading "HH:MM" of a free-text time as minutes-since-midnight, for sorting.
 *  Returns a large number when no time is parseable so blanks sort last. */
export function scheduleStartMinutes(time: string): number {
  const m = (time || "").match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Entries in display order (by start time, stable for ties/blanks). */
export function sortedEntries(entries: ScheduleEntry[]): ScheduleEntry[] {
  return entries
    .map((entry, i) => ({ entry, i }))
    .sort((a, b) => {
      const ta = scheduleStartMinutes(a.entry.time);
      const tb = scheduleStartMinutes(b.entry.time);
      return ta !== tb ? ta - tb : a.i - b.i;
    })
    .map(({ entry }) => entry);
}
