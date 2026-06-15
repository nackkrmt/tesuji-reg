"use client";

import { useLiveQuery } from "@/lib/data/store";
import { PublicHeader } from "@/components/PublicHeader";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";

export function InfoPageClient({ kind }: { kind: "schedule" | "rules" }) {
  const { data: tournament, loading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );

  const title = kind === "schedule" ? "กำหนดการ" : "กฎ กติกา";
  const text =
    kind === "schedule"
      ? tournament?.scheduleText ?? ""
      : tournament?.rulesText ?? "";

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <>
      <PublicHeader back="/" title={title} />
      <main className="mx-auto max-w-app px-4 py-4">
        {loading ? (
          <CenterLoader label="กำลังโหลด…" />
        ) : lines.length === 0 ? (
          <EmptyState
            title={`ยังไม่มีข้อมูล${title}`}
            description="ผู้จัดการแข่งขันยังไม่ได้เพิ่มข้อมูลส่วนนี้"
          />
        ) : (
          <Card className="p-2">
            <ul className="divide-y divide-slate-100">
              {lines.map((line, i) => (
                <li
                  key={i}
                  className="flex gap-3 px-3 py-3 text-slate-700"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </>
  );
}
