// Schedule (กำหนดการ) helpers — serialization for the schedule_text carrier
// column, plus formatting used by both the admin builder and the public view.
// Model: กำหนดการ จัดกลุ่มตามรุ่น — each ScheduleGroup is a รุ่น with its own
// ordered list of timed entries (เพิ่มเวลาทีละอัน).
//
// Per day: a multi-day event can give each competition day its own ตาราง
// (ScheduleGroup.day, 1-based into competitionDates). A schedule is either
// every-day — no ตาราง has a day, the shape every row saved before this held —
// or per-day, where every ตาราง has one; the admin form refuses a mix. A mix
// that reaches a reader anyway (a hand-edited row) is read generously: an
// every-day ตาราง applies on every day.

import {
  SCHEDULE_EVENT_TYPES,
  ScheduleEntry,
  ScheduleEventType,
  ScheduleGroup,
} from "@/lib/data/types";
import { competitionDayAt } from "@/lib/competition-dates";

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
  const group: ScheduleGroup = { categoryIds, entries };
  // Only a real day number is kept. Anything else — absent, null, junk — is an
  // every-day ตาราง, and the key stays off so such a row reads (and writes back)
  // exactly as it did before days existed.
  if (isScheduleDay(o.day)) group.day = o.day;
  return group;
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

// ── per-day ──────────────────────────────────────────────────────────────────

/** A ScheduleGroup.day value: a whole number from 1 (วันที่ 1). */
export function isScheduleDay(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

/** Whether the กำหนดการ is split by competition day: any ตาราง has a day.
 *  Reads only `day`, so the admin form's values qualify as well. */
export function isPerDaySchedule(
  groups: readonly Pick<ScheduleGroup, "day">[],
): boolean {
  return groups.some((g) => g.day != null);
}

/** The ตาราง that apply on competition day `day` (1-based): that day's own,
 *  plus any every-day ones. */
export function groupsForDay<G extends Pick<ScheduleGroup, "day">>(
  groups: readonly G[],
  day: number,
): G[] {
  return groups.filter((g) => g.day == null || g.day === day);
}

export interface ScheduleDay {
  day: number; // 1-based
  iso: string; // the competition day it stands for
  groups: ScheduleGroup[];
}

/** A per-day กำหนดการ laid out under its days, for the public page: one entry
 *  for every competition day, in order — a day with no ตาราง yet included,
 *  since "not yet" is still worth saying. A ตาราง on a day the tournament no
 *  longer has (a day was removed) belongs to none of them and is left out.
 *
 *  Null for an every-day schedule, and for one with no days to hang it on
 *  (legacy free-text dates): both render flat, exactly as before. `days` must
 *  be normalized — competitionDays() gives that. */
export function scheduleByDay(
  groups: readonly ScheduleGroup[],
  days: readonly string[],
): ScheduleDay[] | null {
  if (!isPerDaySchedule(groups) || days.length === 0) return null;
  return days.map((iso, i) => ({ day: i + 1, iso, groups: groupsForDay(groups, i + 1) }));
}

/** What the live board shows: ONE day's ตาราง — today on a competition day,
 *  the next one before and between days, the last one after
 *  (competitionDayAt, Bangkok time). `day` is that competition day's ISO
 *  date, for the board to say which day it is showing.
 *
 *  An every-day schedule passes through untouched with day "", and so does a
 *  per-day one with no days to pick from: that is what the board did before.
 *  This runs on the server, so a board or judge console still running an
 *  older common.js shows the right day's ตาราง as well. */
export function liveScheduleFor(
  groups: readonly ScheduleGroup[],
  days: readonly string[],
  now: number = Date.now(),
): { groups: ScheduleGroup[]; day: string } {
  const at = isPerDaySchedule(groups) ? competitionDayAt(days, now) : null;
  if (!at) return { groups: [...groups], day: "" };
  return { groups: groupsForDay(groups, at.day), day: at.iso };
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
