"use client";

import { PersonHistoryEntry } from "@/lib/data/types";
import { powerToLabel } from "@/lib/rank";
import { useI18n } from "@/lib/i18n";

/** kyu event_date is either ISO-ish ("2568-01-03T17:00:00.000Z" — Buddhist year
 *  kept exactly as imported) or free text ("13/7/2568"); award event_date is
 *  free text ("Aug 6, 2023"). Strip only the unambiguous ISO time tail — never
 *  reformat, the year system is unknowable per row. */
export function formatEventDate(raw: string | null): string | null {
  if (!raw) return null;
  return /^\d{4}-\d{2}-\d{2}T/.test(raw) ? raw.slice(0, 10) : raw;
}

/** gat rating (numeric) → integer-ish display string. */
export function formatGat(rating: number | null): string | null {
  if (rating == null || Number.isNaN(Number(rating))) return null;
  return String(Math.round(Number(rating)));
}

/** Flat list of a person's raw rank-history lines (dan → kyu → award — the RPC
 *  order), styled like the candidate-card evidence list in RankPicker. Shared
 *  by the RankPicker history panel and the admin /admin/people tab. */
export function RankHistoryList({
  entries,
}: {
  entries: PersonHistoryEntry[];
}) {
  const { t, locale } = useI18n();

  const line = (e: PersonHistoryEntry): string => {
    const rankLabel = e.rank ?? powerToLabel(e.powerLevel, locale);
    if (e.source === "dan") {
      const parts: string[] = [t.rank.historyRankLevel(rankLabel)];
      const gat = formatGat(e.rating);
      // seq + gat ride one segment ("… (seq) = 12 | Gat point (gat) = 2200").
      const seqGat = [
        e.seq ? t.rank.historySeq(e.seq) : null,
        gat ? t.rank.historyGat(gat) : null,
      ]
        .filter(Boolean)
        .join(" | ");
      if (seqGat) parts.push(seqGat);
      if (e.yearPromoted != null)
        parts.push(t.rank.historyYearPromoted(e.yearPromoted));
      if (e.diamond) parts.push(t.rank.historyDiamond(e.diamond));
      return parts.join(" · ");
    }
    if (e.source === "kyu") {
      return [t.rank.historyKyuPassed(rankLabel), formatEventDate(e.eventDate)]
        .filter(Boolean)
        .join(" · ");
    }
    // award — same wording as the search-candidate evidence (buildEvidence).
    const date = formatEventDate(e.eventDate);
    return [
      e.rankAward != null ? t.rank.historyAwardPlace(e.rankAward) : null,
      e.category ? t.rank.historyAwardCategory(e.category) : null,
      e.rankInCategory ? t.rank.historyAwardGroup(e.rankInCategory) : null,
      e.eventName ? t.rank.historyAwardEvent(e.eventName) : null,
      date ? t.rank.historyAwardDate(date) : null,
    ]
      .filter(Boolean)
      .join(" · ");
  };

  if (entries.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-xs text-white/55">
      {entries.map((e) => (
        <li key={e.id}>· {line(e)}</li>
      ))}
    </ul>
  );
}
