"use client";

import { Card } from "@/components/ui/Card";
import { CodeChip, EmptyState } from "@/components/ui/feedback";
import { useI18n } from "@/lib/i18n";
import {
  SCHEDULE_EVENT_ICON,
  type Category,
  type Tournament,
} from "@/lib/data/types";
import { sortedEntries } from "@/lib/schedule";
import { RulesBlocks } from "@/components/rules/RulesBlocks";
import { useTournament } from "@/components/tournament/TournamentProvider";

/** Schedule / rules tab bodies under /t/[tid] — the tournament row and the
 *  surrounding chrome come from TournamentProvider. */
export function InfoPageClient({ kind }: { kind: "schedule" | "rules" }) {
  const { tournament, categories } = useTournament();

  return (
    <main className="mx-auto max-w-app px-4 pb-dock pt-4">
      {kind === "schedule" ? (
        <ScheduleView tournament={tournament} categories={categories} />
      ) : (
        <RulesView tournament={tournament} />
      )}
    </main>
  );
}

function ScheduleView({
  tournament,
  categories,
}: {
  tournament: Tournament | null;
  categories: Category[];
}) {
  const { t } = useI18n();
  const groups = tournament?.scheduleGroups ?? [];
  if (groups.length === 0) {
    return (
      <EmptyState
        title={t.info.noScheduleTitle}
        description={t.info.noScheduleDesc}
      />
    );
  }
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  return (
    <div className="space-y-4">
      {groups.map((group, gi) => {
        const cats = group.categoryIds
          .map((id) => categoryById.get(id))
          .filter((c): c is NonNullable<typeof c> => Boolean(c));
        const entries = sortedEntries(group.entries);
        return (
          <div
            key={`${group.categoryIds.join("-")}-${gi}`}
            className="animate-rise-in"
            style={{ animationDelay: `${Math.min(gi, 8) * 30}ms` }}
          >
          <Card className="overflow-hidden p-0">
            {/* Same header anatomy as the participants groups — one card
                language across the tournament sub-pages. */}
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
              {cats.map((c) => (
                <CodeChip key={c.id}>{c.code}</CodeChip>
              ))}
              <span className="font-semibold text-ink">
                {cats.length
                  ? cats.map((c) => c.name).join(" + ")
                  : t.info.categoryFallback}
              </span>
            </div>
            {entries.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-tertiary">
                {t.info.noEntriesInGroup}
              </p>
            ) : (
              <ul className="divide-y divide-white/10">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="grid grid-cols-[64px_28px_1fr] items-baseline gap-x-2 px-4 py-3"
                  >
                    <span className="text-sm font-semibold tabular-nums text-brand-300">
                      {entry.time || "—"}
                    </span>
                    <span className="justify-self-center text-lg leading-none">
                      {SCHEDULE_EVENT_ICON[entry.type]}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">
                        {t.info.event[entry.type]}
                        {entry.type === "match" && entry.boardNumber
                          ? t.info.boardNo(entry.boardNumber)
                          : ""}
                      </p>
                      {entry.note && (
                        <p className="text-sm text-ink-tertiary">{entry.note}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          </div>
        );
      })}
    </div>
  );
}

type RulesLine = {
  depth: number; // indent level 0–6
  marker: string | null; // leading clause number to emphasize (10.1.3.4.3, 2.1, 1.)
  label: string | null; // left side of a "label <tab/gap> value" row (โคมิ, รางวัล)
  text: string; // the item text (or the value, when label is set)
};

// Parse one rules line into its render parts, so the admin can paste a document
// almost verbatim. Indent depth comes from BOTH leading tabs/spaces (unnumbered
// sub-items) AND a leading dotted number (10.1.3.4.3 → 4); whichever is deeper
// wins. A "label <tab or 2+ spaces> value" line splits into two columns.
function parseRulesLine(raw: string): RulesLine {
  const ws = raw.match(/^[ \t]*/)?.[0] ?? "";
  const tabs = (ws.match(/\t/g) ?? []).length;
  const spaces = ws.replace(/\t/g, "").length;
  const wsDepth = tabs + Math.floor(spaces / 4);

  let body = raw.slice(ws.length);
  let marker: string | null = null;
  let numDepth = 0;
  const mm = body.match(/^(\d+(?:\.\d+)*[.)]?)\s+/);
  if (mm) {
    marker = mm[1];
    numDepth = mm[1].replace(/[.)]$/, "").split(".").length - 1;
    body = body.slice(mm[0].length);
  }

  let label: string | null = null;
  let text = body;
  const kv = body.match(/^(.+?)(?:\t+|\s{2,})(\S.*)$/);
  if (kv) {
    label = kv[1].trim();
    text = kv[2].trim();
  }

  return {
    depth: Math.min(Math.max(wsDepth, numDepth), 6),
    marker,
    label,
    text,
  };
}

// The number marker, emphasized, when a line carries a leading clause number.
function RulesMarker({ marker }: { marker: string | null }) {
  if (!marker) return null;
  return <span className="mr-1.5 font-semibold text-brand-300">{marker}</span>;
}

// Legacy fallback: renders a section's pre-block-editor line-based body, so a
// section not yet re-authored with blocks still shows something. Plain
// indented paragraphs, with runs of "label · value" lines collected into a
// borderless two-column table.
function RulesBody({ items }: { items: string[] }) {
  const lines = items.map(parseRulesLine);
  const blocks: JSX.Element[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].label !== null) {
      const start = i;
      const depth = lines[i].depth;
      const rows = [];
      while (i < lines.length && lines[i].label !== null) {
        rows.push(lines[i]);
        i++;
      }
      blocks.push(
        <table
          key={start}
          className="w-full text-sm leading-relaxed"
          style={depth ? { paddingLeft: `${Math.min(depth, 4) * 0.75}rem` } : undefined}
        >
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="align-top">
                <td
                  className="whitespace-pre-wrap py-1 pr-5 font-medium text-ink"
                  style={depth ? { paddingLeft: `${Math.min(depth, 4) * 0.75}rem` } : undefined}
                >
                  <RulesMarker marker={r.marker} />
                  {r.label}
                </td>
                <td className="py-1 text-ink-secondary">{r.text}</td>
              </tr>
            ))}
          </tbody>
        </table>,
      );
    } else {
      const line = lines[i];
      const next = lines[i + 1];
      // A plain line that introduces an indented block (or a table) below it
      // reads as a sub-heading (e.g. a รุ่น name above its specs/prizes).
      const isHeading =
        !line.marker &&
        !!next &&
        (next.depth > line.depth || next.label !== null);
      blocks.push(
        <p
          key={i}
          className={
            isHeading
              ? "mt-3 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-white"
              : "whitespace-pre-wrap text-sm leading-relaxed text-ink-secondary"
          }
          style={{ paddingLeft: `${Math.min(line.depth, 4) * 0.75}rem` }}
        >
          <RulesMarker marker={line.marker} />
          {line.text}
        </p>,
      );
      i++;
    }
  }
  return <>{blocks}</>;
}

function RulesView({ tournament }: { tournament: Tournament | null }) {
  const { t, locale } = useI18n();
  const sections = tournament?.rulesSections ?? [];
  if (sections.length === 0) {
    return (
      <EmptyState
        title={t.info.noRulesTitle}
        description={t.info.noRulesDesc}
      />
    );
  }
  return (
    <div className="space-y-7 pb-4">
      {/* Rules content is author-entered Thai (like the rest of the app's
          content); flag that to non-Thai readers instead of silently mixing. */}
      {locale !== "th" && (
        <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-ink-secondary">
          {t.info.rulesThaiOnly}
        </p>
      )}
      {sections.map((section, si) => (
        <section key={si}>
          <h2 className="mb-2 border-b border-white/10 pb-1.5 text-base font-bold text-ink">
            {section.title}
          </h2>
          {section.blocks.length > 0 ? (
            <RulesBlocks blocks={section.blocks} />
          ) : section.items && section.items.length > 0 ? (
            <div className="space-y-1">
              <RulesBody items={section.items} />
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}
