"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "@/lib/data/store";
import type { Category, Tournament } from "@/lib/data/types";
import { PublicHeader } from "@/components/PublicHeader";
import { RegisterCta, regState } from "@/components/tournament/RegisterCta";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { OverviewSkeleton } from "@/components/tournament/OverviewSkeleton";
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
 *  (the header) around every sub-page, and exposes the row via
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
  // The categories query's failure counts as the page failing: every consumer
  // renders `categories ?? []`, so a dropped read shows a tournament with "no
  // divisions open for registration yet" — indistinguishable from an organiser
  // who hasn't added any.
  const {
    data: categories,
    error: categoriesError,
    refetch: refetchCategories,
  } = useLiveQuery((d) => d.listCategories(tid), [tid]);

  if (loading) {
    // Chrome stays put while the tournament loads; the body is a skeleton of
    // the overview's real geometry so nothing jumps when content lands.
    return (
      <>
        <PublicHeader
          back="/"
          backLabel={t.header.backToList}
          subtleAuthCta
        />
        <OverviewSkeleton />
      </>
    );
  }

  // No sub-tabs on the two failure branches below: there is no tournament to
  // navigate, so every tab would be a link into the same error. The loading
  // branch DOES get them — the header must not grow by a row when data lands.
  if (error || categoriesError) {
    return (
      <>
        <PublicHeader back="/" backLabel={t.header.backToList} subtleAuthCta />
        <main className="mx-auto max-w-app px-4 pb-dock pt-10">
          <ErrorState
            onRetry={() => {
              if (error) refetch();
              if (categoriesError) refetchCategories();
            }}
          />
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

  // Back from the overview leaves the tournament (to the chooser); back from a
  // sub-page returns to the overview — the only way out now that the header
  // carries no sub-tab bar. In-tournament navigation is the overview's tile
  // grid; the bottom dock stays the app's four fixed tabs on every screen,
  // tournament or not.
  // The overview's hero owns the tournament name, so its header keeps the
  // app identity — sub-pages (no hero) put the name in the header instead.
  const isOverview = pathname === `/t/${tid}`;
  // Shared links land straight on a sub-page, and register/success sends people
  // to the participant list — without this those screens have no way to
  // register at all. Only while the window is actually open: the closed/full/
  // not-yet banner is the overview's job, not a header on every sub-page.
  const showSubPageCta =
    !isOverview && regState(tournament, value.categories).canRegister;
  return (
    <Ctx.Provider value={value}>
      <PublicHeader
        back={isOverview ? "/" : `/t/${tid}`}
        backLabel={isOverview ? t.header.backToList : undefined}
        title={isOverview ? undefined : tournament.nameTh}
        subtleAuthCta
      />
      {showSubPageCta && (
        <div className="mx-auto max-w-app px-4 pt-4">
          <RegisterCta
            tournament={tournament}
            categories={value.categories}
            href={`/t/${tid}/register`}
          />
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}
