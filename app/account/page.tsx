"use client";

import { useMemo, useState } from "react";
import {
  activeRegistrationKeys,
  ManagedPlayer,
  personMatchKey,
} from "@/lib/data/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { PlayerSheet } from "@/components/account/PlayerSheet";
import {
  applyPlayerFilter,
  DEFAULT_PLAYER_FILTER,
  PlayerFilterBar,
  PlayerFilterState,
} from "@/components/players/PlayerFilterBar";
import { powerToLabel } from "@/lib/rank";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { fullNameTh } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export default function AccountPage() {
  return (
    <RequireAuth next="/account">
      <AccountContent />
    </RequireAuth>
  );
}

function AccountContent() {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const dl = useDataLayer();
  const toast = useToast();

  const { data: players, loading } = useLiveQuery(
    (d) => d.listMyPlayers(),
    [user?.id],
  );
  const { data: registrations } = useLiveQuery(
    (d) => d.listMyRegistrations(),
    [user?.id],
  );
  const { data: tournament } = useLiveQuery((d) => d.getActiveTournament(), []);

  // Players who currently hold a live registration can't be deleted.
  const registeredKeys = useMemo(
    () => activeRegistrationKeys(registrations ?? []),
    [registrations],
  );
  // "Entered / not entered" filter checks the CURRENT tournament only —
  // a confirmed seat from a past event shouldn't count as entered.
  const currentTournamentKeys = useMemo(
    () =>
      tournament
        ? activeRegistrationKeys(registrations ?? [], tournament.id)
        : new Set<string>(),
    [registrations, tournament],
  );

  const [filter, setFilter] = useState<PlayerFilterState>(DEFAULT_PLAYER_FILTER);
  const visiblePlayers = useMemo(
    () =>
      applyPlayerFilter(players ?? [], (p) => p, filter, currentTournamentKeys),
    [players, filter, currentTournamentKeys],
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedPlayer | null>(null);

  async function onDelete(p: ManagedPlayer) {
    if (!window.confirm(t.players.confirmDelete(fullNameTh(p)))) return;
    try {
      await dl.deleteMyPlayer(p.id);
      toast.show(t.players.deleted, "success");
    } catch (e) {
      const msg =
        e instanceof Error && e.message === "PLAYER_HAS_REGISTRATIONS"
          ? t.players.hasRegistrations
          : t.players.deleteFailed;
      toast.show(msg, "error");
    }
  }

  return (
    <>
      <PublicHeader back="/" title={t.players.headerTitle} />
      <main className="mx-auto max-w-app px-4 pb-dock pt-4">
        <p className="mb-3 text-sm text-white/55">
          {t.players.subtitle}
        </p>

        {loading ? (
          <CenterLoader />
        ) : (players?.length ?? 0) === 0 ? (
          <EmptyState
            title={t.players.emptyTitle}
            description={t.players.emptyDesc}
          />
        ) : (
          <>
          <PlayerFilterBar value={filter} onChange={setFilter} />
          {visiblePlayers.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/45">
              {t.playerFilter.noMatch}
            </p>
          ) : (
          <div className="space-y-3">
            {visiblePlayers.map((p) => {
              const locked = registeredKeys.has(personMatchKey(p));
              return (
                <Card key={p.id} className="flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white/90">
                      {fullNameTh(p)}
                    </p>
                    <p className="text-sm text-white/45">
                      {p.phone} · {powerToLabel(p.powerLevel, locale)}
                    </p>
                    {locked && (
                      <p className="mt-0.5 text-xs text-amber-300/80">
                        {t.players.lockedNote}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-300 transition hover:bg-brand-500/10"
                    >
                      {t.common.edit}
                    </button>
                    <button
                      onClick={() => onDelete(p)}
                      disabled={locked}
                      title={locked ? t.players.lockedTitle : undefined}
                      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:text-white/25 disabled:hover:bg-transparent"
                    >
                      {t.common.delete}
                    </button>
                  </div>
                </Card>
              );
            })}
          </div>
          )}
          </>
        )}

        <Button
          className="mt-4"
          fullWidth
          variant="secondary"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          {t.players.addPlayer}
        </Button>
      </main>

      <PlayerSheet open={open} onClose={() => setOpen(false)} editing={editing} />
    </>
  );
}
