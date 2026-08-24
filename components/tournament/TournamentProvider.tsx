"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "@/lib/data/store";
import type { Category, Tournament } from "@/lib/data/types";
import { PublicHeader } from "@/components/PublicHeader";
import { CenterLoader, EmptyState, ErrorState } from "@/components/ui/feedback";
import { useI18n } from "@/lib/i18n";

interface TournamentCtxValue {
  tournament: Tournament;
  categories: Category[];
}

const Ctx = createContext<TournamentCtxValue | null>(null);

export function useTournament(): TournamentCtxValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTournament must be used inside /t/[tid]");
  return v;
}

/** Loads the tournament for a /t/[tid] subtree once, renders the shared chrome
 *  (header + sub-tab bar) around every sub-page, and exposes the row via
 *  useTournament(). The register wizard keeps its own chrome, so the shared
 *  parts are skipped there. Drafts stay invisible to the public — they 404
 *  into the not-found empty state just like a bad id. */
export function TournamentProvider({
  tid,
  children,
}: {
  tid: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const isRegister = /\/register(\/|$)/.test(pathname);

  const {
    data: tournament,
    loading,
    error,
    refetch,
  } = useLiveQuery((d) => d.getTournament(tid), [tid]);
  const { data: categories } = useLiveQuery(
    (d) => d.listCategories(tid),
    [tid],
  );

  if (loading) return <CenterLoader label={t.common.loading} />;

  if (error) {
    return (
      <>
        <PublicHeader back="/" />
        <main className="mx-auto max-w-app px-4 pb-dock pt-10">
          <ErrorState onRetry={refetch} />
        </main>
      </>
    );
  }

  if (!tournament || tournament.status === "draft") {
    return (
      <>
        <PublicHeader back="/" />
        <main className="mx-auto max-w-app px-4 pb-dock pt-10">
          <EmptyState
            title={t.tourn.notFoundTitle}
            description={t.tourn.notFoundDesc}
          />
        </main>
      </>
    );
  }

  const value: TournamentCtxValue = {
    tournament,
    categories: categories ?? [],
  };

  if (isRegister) {
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  // GitHub-style context: back from the overview leaves the tournament (to
  // the chooser); back from a sub-page returns to the overview. The dock
  // (GlassDock, tournament mode) carries the in-tournament navigation.
  const isOverview = pathname === `/t/${tid}`;
  return (
    <Ctx.Provider value={value}>
      <PublicHeader
        back={isOverview ? "/" : `/t/${tid}`}
        title={tournament.nameTh}
      />
      {children}
    </Ctx.Provider>
  );
}
