"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { PublicHeader } from "@/components/PublicHeader";
import { EmptyState } from "@/components/ui/feedback";
import { useAuth } from "@/components/auth/AuthProvider";
import { useI18n } from "@/lib/i18n";
import { getJudgeToken, getMyJudgeStatus, listDivisions } from "@/lib/live/client";
import { IconBroadcast, IconFlag } from "@/components/icons";

/** ผลการแข่งขัน hub — the nav home of the live board (and, for judges, the
 *  judge console). One global board for now; per-tournament boards arrive with
 *  the live-scoping phase. */
export default function ResultsHubClient() {
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();

  const [hasLiveData, setHasLiveData] = useState<boolean | null>(null);
  const [isJudge, setIsJudge] = useState(false);

  useEffect(() => {
    let active = true;
    listDivisions()
      .then((divs) => {
        if (active) setHasLiveData(divs.length > 0);
      })
      .catch(() => {
        if (active) setHasLiveData(false);
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

  return (
    <>
      <PublicHeader title={t.results.title} />
      <main className="mx-auto max-w-app px-4 pb-dock pt-4">
        <p className="mb-4 text-sm text-white/55">{t.results.subtitle}</p>

        {hasLiveData ? (
          // /live is a raw route handler (v1 results.html), not a Next page —
          // plain <a>, not <Link>.
          <a
            href="/live"
            className="hover-glass flex flex-col items-center justify-center gap-2.5 rounded-3xl border border-brand-400/25 bg-brand-500/10 py-9 text-center transition"
          >
            <span className="text-brand-300">
              <IconBroadcast size={40} />
            </span>
            <span className="font-bold text-white">{t.results.liveNow}</span>
            <span className="text-sm font-medium text-brand-300">
              {t.results.openBoard}
            </span>
          </a>
        ) : hasLiveData === false ? (
          <div className="pt-4">
            <EmptyState
              title={t.results.emptyTitle}
              description={t.results.emptyDesc}
            />
          </div>
        ) : null}

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
