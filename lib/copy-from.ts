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

import type { Category, RulesSection, ScheduleGroup } from "@/lib/data/types";

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
}

/** The source schedule re-pointed at this tournament's รุ่น.
 *
 *  `taken` holds รุ่น already used by a ตาราง that stays (append mode) — a รุ่น
 *  belongs to exactly one ตาราง, so a copied ตาราง drops it. A ตาราง that ends up
 *  with no รุ่น is kept rather than dropped: its times are the part worth
 *  copying, and the schedule editor will not save it until a รุ่น is ticked. */
export function copyScheduleGroups(
  sourceGroups: readonly ScheduleGroup[],
  sourceCats: readonly Pick<Category, "id" | "code" | "name">[],
  targetCats: readonly Pick<Category, "id" | "code" | "name">[],
  opts: { taken?: ReadonlySet<string>; newId: () => string },
): ScheduleCopy {
  const used = new Set(sourceGroups.flatMap((g) => g.categoryIds ?? []));
  const { map, unmatched } = matchCategories(
    sourceCats.filter((c) => used.has(c.id)),
    targetCats,
  );
  const taken = new Set(opts.taken ?? []);
  let emptyGroups = 0;

  const groups: ScheduleGroup[] = sourceGroups.map((g) => {
    const categoryIds: string[] = [];
    for (const id of g.categoryIds ?? []) {
      const target = map.get(id);
      if (!target || taken.has(target)) continue;
      taken.add(target);
      categoryIds.push(target);
    }
    if (categoryIds.length === 0) emptyGroups++;
    return {
      categoryIds,
      entries: (g.entries ?? []).map((e) => ({ ...e, id: opts.newId() })),
    };
  });

  // A source id that points at no source รุ่น any more (deleted รุ่น) is not
  // something the organiser can act on, so it is not reported.
  return { groups, unmatched, emptyGroups };
}
