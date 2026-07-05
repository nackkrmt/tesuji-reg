"use client";

import dynamic from "next/dynamic";
import { useLiveQuery } from "@/lib/data/store";
import { PublicHeader } from "@/components/PublicHeader";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState, ErrorState } from "@/components/ui/feedback";
import { useI18n } from "@/lib/i18n";

// The loader renders inside the provider tree, so it can read translations.
function PdfLoading() {
  const { t } = useI18n();
  return (
    <div className="py-16 text-center text-sm text-white/50">
      {t.info.preparingReader}
    </div>
  );
}

// pdfjs touches browser-only APIs (DOMMatrix, canvas) — never render on server.
const RulesPdfViewer = dynamic(() => import("@/components/RulesPdfViewer"), {
  ssr: false,
  loading: () => <PdfLoading />,
});
import {
  SCHEDULE_EVENT_ICON,
  type Category,
  type Tournament,
} from "@/lib/data/types";
import { sortedEntries } from "@/lib/schedule";

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
          <RulesView pdfUrl={tournament?.rulesPdfUrl ?? null} />
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

function RulesView({ pdfUrl }: { pdfUrl: string | null }) {
  const { t } = useI18n();
  if (!pdfUrl) {
    return (
      <EmptyState
        title={t.info.noRulesTitle}
        description={t.info.noRulesDesc}
      />
    );
  }
  return (
    <div className="space-y-3">
      <a
        href={pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3 font-semibold text-white shadow-[0_8px_24px_-8px_rgba(10,132,255,0.7)] transition hover:bg-brand-500"
      >
        <span>📄</span> {t.info.openPdf}
      </a>
      <RulesPdfViewer url={pdfUrl} />
    </div>
  );
}
