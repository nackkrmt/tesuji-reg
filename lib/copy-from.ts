// "คัดลอกจากรายการอื่น" on /admin/rules and the กำหนดการ card of
// /admin/tournament — pull another tournament's กฎ กติกา or กำหนดการ into the
// editor of the tournament being edited. Nothing is saved here: the copy lands
// in the editor and the organiser saves it the usual way, so a wrong pick is
// undone by not saving.
//
// Rules copy as-is. The schedule cannot: every ตาราง points at รุ่น by
// category id, and the other tournament's ids mean nothing here. Each source
// รุ่น is matched to a รุ่น of this tournament by NAME (normalised); what has no
// match is reported, never invented.
//
// Not by code. The code is the รุ่น's running number within its own
// tournament, so the same number means different รุ่น from one event to the
// next: in Buddy go x Piyachat (2026-08) "01" is 1-2 Kyu, in Lotus's x Buddy GO
// (2026-10) "01" is 1-2 Dan. Matching on it put a kyu schedule on the dan รุ่น.
//
// A per-day schedule keeps its days (วันที่ 1 stays วันที่ 1 — the day is an
// index, not a date, so it means the same in the new event). Appending never
// mixes an every-day schedule with a per-day one; see copyScheduleGroups.

import type { Category, RulesSection, ScheduleGroup } from "@/lib/data/types";
import { isPerDaySchedule } from "@/lib/schedule";

export type CopyMode = "replace" | "append";

/** The editor's limit (rulesFormSchema). */
export const MAX_RULES_SECTIONS = 50;

/** Copied sections, deep-cloned so editing the copy never touches the source
 *  tournament's objects in the shared cache. */
export function cloneRulesSections(sections: readonly RulesSection[]): RulesSection[] {
  return JSON.parse(JSON.stringify(sections ?? [])) as RulesSection[];
}

/** What the rules editor should hold after a copy, or an error message when
 *  the result would not be saveable. */
export function mergeRulesSections(
  current: readonly RulesSection[],
  copied: readonly RulesSection[],
  mode: CopyMode,
): { sections: RulesSection[] } | { error: string } {
  const next = mode === "replace"
    ? cloneRulesSections(copied)
    : [...cloneRulesSections(current), ...cloneRulesSections(copied)];
  if (next.length > MAX_RULES_SECTIONS) {
    return {
      error: `รวมแล้ว ${next.length} หัวข้อ เกินที่บันทึกได้ (${MAX_RULES_SECTIONS}) — เลือก "แทนที่ของเดิม" หรือลบหัวข้อเดิมบางส่วนก่อน`,
    };
  }
  return { sections: next };
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** How an unmatched รุ่น is named to the organiser: by name, since its code
 *  means nothing in this tournament. */
function label(c: Pick<Category, "code" | "name">): string {
  return c.name?.trim() || c.code?.trim() || "";
}

/** Source รุ่น id → target รุ่น id, by normalised name (never by code — see the
 *  top of this file). A target รุ่น is claimed once, so two source รุ่น can never
 *  both land on it. */
export function matchCategories(
  sourceCats: readonly Pick<Category, "id" | "code" | "name">[],
  targetCats: readonly Pick<Category, "id" | "code" | "name">[],
): { map: Map<string, string>; unmatched: string[] } {
  const map = new Map<string, string>();
  const claimed = new Set<string>();
  const unmatched: string[] = [];
  for (const s of sourceCats) {
    const name = norm(s.name);
    const hit = name
      ? targetCats.find((t) => !claimed.has(t.id) && norm(t.name) === name)
      : undefined;
    if (hit) {
      map.set(s.id, hit.id);
      claimed.add(hit.id);
    } else {
      unmatched.push(label(s));
    }
  }
  return { map, unmatched };
}

export interface ScheduleCopy {
  /** Groups pointing at THIS tournament's รุ่น, with fresh entry ids. */
  groups: ScheduleGroup[];
  /** Source รุ่น (in the copied ตาราง) with no รุ่น here — "code name". */
  unmatched: string[];
  /** Copied ตาราง left with no รุ่น; the editor asks for one before saving. */
  emptyGroups: number;
  /** Copied ตาราง on a day this tournament does not have (the source ran
   *  more days); the editor flags them until they are moved or removed.
   *  Counted only when `dayCount` is given. */
  beyondDays: number;
  /** The day an every-day source was put on, when it was appended to a
   *  per-day schedule; null otherwise. */
  ontoDay: number | null;
}

/** Why a copy was not made at all, in words for the organiser. */
export interface ScheduleCopyRefused {
  refused: string;
}

/** The source schedule re-pointed at this tournament's รุ่น.
 *
 *  `existing` is the ตาราง that stay (append mode; replace passes none). A รุ่น
 *  is in one ตาราง per day — for an every-day schedule, one ตาราง full stop — so
 *  a copied ตาราง drops a รุ่น its day already has. A ตาราง that ends up with no
 *  รุ่น is kept rather than dropped: its times are the part worth copying, and
 *  the schedule editor will not save it until a รุ่น is ticked.
 *
 *  Days come along unchanged, except when appending would mix the two shapes:
 *    · an every-day source appended to a per-day schedule goes onto ONE day,
 *      `appendDay` (the tab the organiser is looking at), reported as ontoDay;
 *    · a per-day source cannot be appended to an every-day schedule without
 *      either merging its days (Saturday's and Sunday's times interleaved —
 *      the very thing days exist to prevent) or dropping some of them, so
 *      that copy is refused with the way out. */
export function copyScheduleGroups(
  sourceGroups: readonly ScheduleGroup[],
  sourceCats: readonly Pick<Category, "id" | "code" | "name">[],
  targetCats: readonly Pick<Category, "id" | "code" | "name">[],
  opts: {
    existing?: readonly Pick<ScheduleGroup, "categoryIds" | "day">[];
    appendDay?: number;
    /** This tournament's number of competition days, for beyondDays. */
    dayCount?: number;
    newId: () => string;
  },
): ScheduleCopy | ScheduleCopyRefused {
  const existing = opts.existing ?? [];
  const appending = existing.length > 0;
  const sourcePerDay = isPerDaySchedule(sourceGroups);
  const targetPerDay = isPerDaySchedule(existing);
  if (appending && sourcePerDay && !targetPerDay) {
    return {
      refused:
        "กำหนดการต้นทางแยกตามวันแข่ง แต่ของรายการนี้ใช้ตารางเดียวกันทุกวัน จึงเพิ่มต่อท้ายไม่ได้ — เลือก “แทนที่ของเดิม”" +
        ((opts.dayCount ?? 0) >= 2
          ? " หรือปิด “ใช้กำหนดการเดียวกันทุกวัน” ก่อนแล้วค่อยเพิ่มต่อท้าย"
          : ""),
    };
  }
  const ontoDay =
    appending && targetPerDay && !sourcePerDay ? Math.max(1, opts.appendDay ?? 1) : null;

  const used = new Set(sourceGroups.flatMap((g) => g.categoryIds ?? []));
  const { map, unmatched } = matchCategories(
    sourceCats.filter((c) => used.has(c.id)),
    targetCats,
  );
  // รุ่น already on each day; 0 is the every-day bucket.
  const taken = new Map<number, Set<string>>();
  const takenOn = (day: number | null): Set<string> => {
    const key = day ?? 0;
    let set = taken.get(key);
    if (!set) taken.set(key, (set = new Set()));
    return set;
  };
  for (const g of existing) {
    for (const id of g.categoryIds ?? []) takenOn(g.day ?? null).add(id);
  }
  let emptyGroups = 0;
  let beyondDays = 0;

  const groups: ScheduleGroup[] = sourceGroups.map((g) => {
    const day = ontoDay ?? g.day ?? null;
    const onDay = takenOn(day);
    const categoryIds: string[] = [];
    for (const id of g.categoryIds ?? []) {
      const target = map.get(id);
      if (!target || onDay.has(target)) continue;
      onDay.add(target);
      categoryIds.push(target);
    }
    if (categoryIds.length === 0) emptyGroups++;
    if (day != null && opts.dayCount != null && day > opts.dayCount) beyondDays++;
    const copy: ScheduleGroup = {
      categoryIds,
      entries: (g.entries ?? []).map((e) => ({ ...e, id: opts.newId() })),
    };
    if (day != null) copy.day = day;
    return copy;
  });

  // A source id that points at no source รุ่น any more (deleted รุ่น) is not
  // something the organiser can act on, so it is not reported.
  return { groups, unmatched, emptyGroups, beyondDays, ontoDay };
}
