"use client";

import { useLiveQuery } from "@/lib/data/store";
import { PublicHeader } from "@/components/PublicHeader";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState, ErrorState } from "@/components/ui/feedback";
import { useI18n } from "@/lib/i18n";
import {
  SCHEDULE_EVENT_ICON,
  type Category,
  type Tournament,
} from "@/lib/data/types";
import { sortedEntries } from "@/lib/schedule";
import { RulesBlocks } from "@/components/rules/RulesBlocks";

export function InfoPageClient({ kind }: { kind: "schedule" | "rules" }) {
  const { t } = useI18n();
  const {
    data: tournament,
    loading,
    error,
    refetch,
  } = useLiveQuery((d) => d.getActiveTournament(), []);
  const { data: categories } = useLiveQuery(
    (d) => (tournament ? d.listCategories(tournament.id) : Promise.resolve([])),
    [tournament?.id],
  );

  const title = kind === "schedule" ? t.nav.schedule : t.nav.rules;

  return (
    <>
      <PublicHeader back="/" title={title} />
      <main className="mx-auto max-w-app px-4 pb-dock pt-4">
        {loading ? (
          <CenterLoader label={t.common.loading} />
        ) : error ? (
          <ErrorState onRetry={refetch} />
        ) : kind === "schedule" ? (
          <ScheduleView
            tournament={tournament ?? null}
            categories={categories ?? []}
          />
        ) : (
          <RulesView tournament={tournament ?? null} />
        )}
      </main>
    </>
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
        const names = group.categoryIds
          .map((id) => categoryById.get(id)?.name)
          .filter(Boolean);
        const entries = sortedEntries(group.entries);
        return (
          <Card
            key={`${group.categoryIds.join("-")}-${gi}`}
            className="overflow-hidden p-0"
          >
            <div className="bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-sm font-bold text-white">
              {names.length ? names.join(" + ") : t.info.categoryFallback}
            </div>
            {entries.length === 0 ? (
              <p className="px-4 py-4 text-sm text-white/45">
                {t.info.noEntriesInGroup}
              </p>
            ) : (
              <ul className="divide-y divide-white/10">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex gap-3 px-3 py-3">
                    <span className="w-20 shrink-0 text-sm font-semibold text-brand-300">
                      {entry.time || "—"}
                    </span>
                    <span className="mt-0.5 text-lg leading-none">
                      {SCHEDULE_EVENT_ICON[entry.type]}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-white/90">
                        {t.info.event[entry.type]}
                        {entry.type === "match" && entry.boardNumber
                          ? t.info.boardNo(entry.boardNumber)
                          : ""}
                      </p>
                      {entry.note && (
                        <p className="text-sm text-white/45">{entry.note}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
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
          style={depth ? { paddingLeft: `${depth}rem` } : undefined}
        >
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="align-top">
                <td
                  className="whitespace-pre-wrap py-1 pr-5 font-medium text-white/90"
                  style={depth ? { paddingLeft: `${depth}rem` } : undefined}
                >
                  <RulesMarker marker={r.marker} />
                  {r.label}
                </td>
                <td className="py-1 text-white/65">{r.text}</td>
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
              : "whitespace-pre-wrap text-sm leading-relaxed text-white/80"
          }
          style={{ paddingLeft: `${line.depth}rem` }}
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
  const { t } = useI18n();
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
      {sections.map((section, si) => (
        <section key={si}>
          <h2 className="mb-2 border-b border-white/10 pb-1.5 text-base font-bold text-brand-200">
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
