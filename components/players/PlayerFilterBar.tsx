"use client";

import { Person, personMatchKey } from "@/lib/data/types";
import { Segmented, Select, TextInput } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n";

export type RegFilter = "all" | "not_registered" | "registered";
export type PlayerSort = "name" | "rank_desc" | "rank_asc";

export interface PlayerFilterState {
  query: string;
  reg: RegFilter;
  sort: PlayerSort;
}

export const DEFAULT_PLAYER_FILTER: PlayerFilterState = {
  query: "",
  reg: "all",
  sort: "name",
};

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Substring match over Thai/English full names and phone. Empty query → all. */
export function matchesPlayerQuery(p: Person, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  return [
    `${p.firstNameTh} ${p.middleNameTh ?? ""} ${p.lastNameTh}`,
    `${p.firstNameEn} ${p.middleNameEn ?? ""} ${p.lastNameEn}`,
    p.phone,
  ].some((h) => norm(h).includes(q));
}

/** `registeredKeys` = personMatchKey set of people holding a live registration
 *  in the tournament being filtered against (see activeRegistrationKeys). */
export function matchesRegFilter(
  p: Person,
  reg: RegFilter,
  registeredKeys: Set<string>,
): boolean {
  if (reg === "all") return true;
  const has = registeredKeys.has(personMatchKey(p));
  return reg === "registered" ? has : !has;
}

const thCollator = new Intl.Collator("th");

/** Name sort = Thai alphabetical (ก-ฮ). Rank sorts put unranked people last,
 *  ties broken by name. */
export function comparePlayers(a: Person, b: Person, sort: PlayerSort): number {
  if (sort !== "name") {
    const pa = a.powerLevel ?? null;
    const pb = b.powerLevel ?? null;
    if (pa == null && pb != null) return 1;
    if (pa != null && pb == null) return -1;
    if (pa != null && pb != null && pa !== pb)
      return sort === "rank_desc" ? pb - pa : pa - pb;
  }
  return (
    thCollator.compare(a.firstNameTh, b.firstNameTh) ||
    thCollator.compare(a.lastNameTh, b.lastNameTh)
  );
}

export function applyPlayerFilter<T>(
  items: readonly T[],
  person: (item: T) => Person,
  state: PlayerFilterState,
  registeredKeys: Set<string>,
): T[] {
  return items
    .filter(
      (it) =>
        matchesPlayerQuery(person(it), state.query) &&
        matchesRegFilter(person(it), state.reg, registeredKeys),
    )
    .sort((a, b) => comparePlayers(person(a), person(b), state.sort));
}

/** Search box + registered/not-registered filter + name/rank sort. Controlled;
 *  pair with applyPlayerFilter over the page's player list. */
export function PlayerFilterBar({
  value,
  onChange,
  className,
}: {
  value: PlayerFilterState;
  onChange: (v: PlayerFilterState) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const f = t.playerFilter;
  return (
    <div className={className ?? "mb-3 space-y-2"}>
      <div className="flex items-stretch gap-2">
        <TextInput
          type="search"
          enterKeyHint="search"
          className="min-w-0 flex-1"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
          placeholder={f.searchPlaceholder}
          aria-label={f.searchPlaceholder}
        />
        {/* wrapper fixes the width — Select itself is w-full (cn has no twMerge) */}
        <div className="w-36 shrink-0">
          <Select
            className="h-full text-sm"
            value={value.sort}
            onChange={(e) =>
              onChange({ ...value, sort: e.target.value as PlayerSort })
            }
            aria-label={f.sortLabel}
          >
            <option value="name">{f.sortName}</option>
            <option value="rank_desc">{f.sortRankDesc}</option>
            <option value="rank_asc">{f.sortRankAsc}</option>
          </Select>
        </div>
      </div>
      <Segmented<RegFilter>
        className="flex w-full"
        options={[
          { value: "all", label: f.filterAll },
          { value: "not_registered", label: f.filterNotRegistered },
          { value: "registered", label: f.filterRegistered },
        ]}
        value={value.reg}
        onChange={(reg) => onChange({ ...value, reg })}
      />
    </div>
  );
}
