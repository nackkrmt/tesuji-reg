"use client";

import { useTournament } from "@/components/tournament/TournamentProvider";
import { ScheduleView, RulesView } from "@/components/tournament/InfoViews";

/** Schedule / rules as full pages under /t/[tid] — the same bodies the
 *  overview's badges open in a sheet. Kept as routes because these links are
 *  shared into LINE and land people straight here. */
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
