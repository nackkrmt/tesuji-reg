"use client";

import { useLiveQuery } from "@/lib/data/store";
import { PublicHeader } from "@/components/PublicHeader";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import {
  SCHEDULE_EVENT_ICON,
  SCHEDULE_EVENT_LABEL,
  type Category,
  type Tournament,
} from "@/lib/data/types";
import { sortedEntries } from "@/lib/schedule";

export function InfoPageClient({ kind }: { kind: "schedule" | "rules" }) {
  const { data: tournament, loading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  const { data: categories } = useLiveQuery(
    (d) => (tournament ? d.listCategories(tournament.id) : Promise.resolve([])),
    [tournament?.id],
  );

  const title = kind === "schedule" ? "กำหนดการ" : "กฎ กติกา";

  return (
    <>
      <PublicHeader back="/" title={title} />
      <main className="mx-auto max-w-app px-4 py-4">
        {loading ? (
          <CenterLoader label="กำลังโหลด…" />
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
  const groups = tournament?.scheduleGroups ?? [];
  if (groups.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีกำหนดการ"
        description="ผู้จัดการแข่งขันยังไม่ได้เพิ่มข้อมูลส่วนนี้"
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
            <div className="bg-brand-700 px-4 py-2.5 text-sm font-bold text-white">
              {names.length ? names.join(" + ") : "รุ่น"}
            </div>
            {entries.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-400">
                ยังไม่มีรายการในรุ่นนี้
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex gap-3 px-3 py-3">
                    <span className="w-20 shrink-0 text-sm font-semibold text-brand-700">
                      {entry.time || "—"}
                    </span>
                    <span className="mt-0.5 text-lg leading-none">
                      {SCHEDULE_EVENT_ICON[entry.type]}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">
                        {SCHEDULE_EVENT_LABEL[entry.type]}
                        {entry.type === "match" && entry.boardNumber
                          ? ` · กระดานที่ ${entry.boardNumber}`
                          : ""}
                      </p>
                      {entry.note && (
                        <p className="text-sm text-slate-400">{entry.note}</p>
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
  if (!pdfUrl) {
    return (
      <EmptyState
        title="ยังไม่มีข้อมูลกฎ กติกา"
        description="ผู้จัดการแข่งขันยังไม่ได้อัปโหลดไฟล์ กฎ กติกา"
      />
    );
  }
  return (
    <div className="space-y-3">
      <a
        href={pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-3 font-semibold text-white hover:bg-brand-800"
      >
        <span>📄</span> เปิด / ดาวน์โหลดไฟล์ กฎ กติกา (PDF)
      </a>
      <Card className="overflow-hidden p-0">
        <iframe src={pdfUrl} title="กฎ กติกา" className="h-[72vh] w-full" />
      </Card>
    </div>
  );
}
