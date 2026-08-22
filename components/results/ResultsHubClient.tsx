"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PublicHeader } from "@/components/PublicHeader";
import { EmptyState } from "@/components/ui/feedback";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLiveQuery } from "@/lib/data/store";
import type { Tournament } from "@/lib/data/types";
import { useI18n } from "@/lib/i18n";
import {
  getJudgeToken,
  getMyJudgeStatus,
  listDivisions,
} from "@/lib/live/client";
import type { LiveDivision } from "@/lib/live/types";
import { groupForHome } from "@/lib/tournament-list";
import { IconBroadcast, IconFlag } from "@/components/icons";

/** ผลการแข่งขัน hub — one card per tournament that has a live board (its
 *  divisions), current events first; divisions not yet assigned to any
 *  tournament fall back to the legacy global board. Judges also get their
 *  console entry here. */
export default function ResultsHubClient() {
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();

  const { data: tournaments } = useLiveQuery(
    (d) => d.listTournaments(),
    [],
    ["tournament"],
  );
  const [divisions, setDivisions] = useState<LiveDivision[] | null>(null);
  const [isJudge, setIsJudge] = useState(false);

  useEffect(() => {
    let active = true;
    listDivisions()
      .then((divs) => {
        if (active) setDivisions(divs);
      })
      .catch(() => {
        if (active) setDivisions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsJudge(false);
      return;
    }
    let active = true;
    getMyJudgeStatus()
      .then(({ isJudge: judge }) => {
        if (active) setIsJudge(judge);
      })
      .catch(() => {
        if (active) setIsJudge(false);
      });
    return () => {
      active = false;
    };
  }, [authLoading, user]);

  async function openJudgeConsole() {
    try {
      const token = await getJudgeToken();
      window.location.href = `/judge/${token}`;
    } catch {
      // ignore — role may have just been revoked
    }
  }

  const hasLiveData = (divisions?.length ?? 0) > 0;

  // Tournaments that own at least one board, current events first.
  const withBoards = new Set(
    (divisions ?? []).map((d) => d.tournamentId).filter(Boolean) as string[],
  );
  const groups = groupForHome(tournaments ?? []);
  const boardTournaments = [
    ...groups.open,
    ...groups.upcoming,
    ...groups.finished,
  ].filter((row) => withBoards.has(row.id));
  const liveIds = new Set([...groups.open, ...groups.upcoming].map((r) => r.id));
  const hasUnassigned = (divisions ?? []).some((d) => d.tournamentId === null);

  return (
    <>
      <PublicHeader title={t.results.title} />
      <main className="mx-auto max-w-app px-4 pb-dock pt-4">
        <p className="mb-4 text-sm text-white/55">{t.results.subtitle}</p>

        {divisions !== null && !hasLiveData ? (
          <div className="pt-4">
            <EmptyState
              title={t.results.emptyTitle}
              description={t.results.emptyDesc}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {boardTournaments.map((row) => (
              <BoardCard
                key={row.id}
                tournament={row}
                live={liveIds.has(row.id)}
              />
            ))}
            {hasUnassigned && (
              // Boards not assigned to a tournament yet → the legacy global
              // board (a raw route handler — plain <a>, not <Link>).
              <a
                href="/live"
                className="hover-glass flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] py-3.5 text-sm font-medium text-white/80 transition"
              >
                <span className="text-brand-300">
                  <IconBroadcast size={18} />
                </span>
                {t.nav.live}
              </a>
            )}
          </div>
        )}

        {isJudge && (
          <button
            type="button"
            onClick={hasLiveData ? openJudgeConsole : undefined}
            disabled={!hasLiveData}
            className={cn(
              "mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-3xl border py-7 text-sm font-medium transition",
              hasLiveData
                ? "hover-glass border-white/10 bg-white/[0.04] text-white/80"
                : "cursor-not-allowed border-white/5 bg-white/[0.02] text-white/30",
            )}
          >
            <span className={hasLiveData ? "text-brand-300" : "text-white/25"}>
              <IconFlag size={32} />
            </span>
            {t.nav.judgeConsole}
          </button>
        )}
      </main>
    </>
  );
}

function BoardCard({
  tournament,
  live,
}: {
  tournament: Tournament;
  live: boolean;
}) {
  const { t } = useI18n();
  return (
    <a
      href={`/live/${tournament.id}`}
      className={cn(
        "hover-glass flex flex-col items-center justify-center gap-2 rounded-3xl border py-7 text-center transition",
        live
          ? "border-brand-400/25 bg-brand-500/10"
          : "border-white/10 bg-white/[0.04]",
      )}
    >
      <span className={live ? "text-brand-300" : "text-white/45"}>
        <IconBroadcast size={32} />
      </span>
      <span className="max-w-[85%] truncate font-bold text-white">
        {tournament.nameTh}
      </span>
      <span
        className={cn(
          "text-sm font-medium",
          live ? "text-brand-300" : "text-white/50",
        )}
      >
        {live ? t.results.liveNow : t.results.openBoard}
      </span>
    </a>
  );
}
