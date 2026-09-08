"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  activeRegistrationKeys,
  ManagedPlayer,
  personMatchKey,
  RosterRegistration,
} from "@/lib/data/types";
import { rosterRegistrationIndex } from "@/lib/data/roster";
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
import { CenterLoader, EmptyState, Pill } from "@/components/ui/feedback";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { useToast } from "@/components/ui/Toast";
import { fullNameTh } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { groupForHome } from "@/lib/tournament-list";

export default function AccountPage() {
  return (
    <RequireAuth next="/account/players">
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
  const { data: tournaments } = useLiveQuery((d) => d.listTournaments(), []);

  // Players who currently hold a live registration can't be deleted.
  const registeredKeys = useMemo(
    () => activeRegistrationKeys(registrations ?? []),
    [registrations],
  );
  // "Entered" means CURRENT tournaments (open for registration, or reg-closed
  // but not yet competed) — a confirmed seat from a past event shouldn't count,
  // but one for next week's closed-registration event still should.
  const currentTournaments = useMemo(() => {
    const groups = groupForHome(tournaments ?? []);
    return [...groups.open, ...groups.upcoming];
  }, [tournaments]);
  const currentIds = useMemo(
    () => currentTournaments.map((t) => t.id),
    [currentTournaments],
  );
  const tournNames = useMemo(
    () => new Map(currentTournaments.map((t) => [t.id, t.nameTh])),
    [currentTournaments],
  );

  // Entries for these people made by ANY account — this is what makes a
  // registration the child's parent submitted show up on the coach's list.
  const { data: rosterRegs } = useLiveQuery(
    (d) =>
      currentIds.length
        ? d.listMyRosterRegistrations(currentIds)
        : Promise.resolve([] as RosterRegistration[]),
    [user?.id, currentIds],
  );
  const rosterIndex = useMemo(
    () => rosterRegistrationIndex(rosterRegs ?? []),
    [rosterRegs],
  );
  const registeredIds = useMemo(
    () => new Set(rosterIndex.keys()),
    [rosterIndex],
  );

  const [filter, setFilter] = useState<PlayerFilterState>(DEFAULT_PLAYER_FILTER);
  const visiblePlayers = useMemo(
    () =>
      applyPlayerFilter(
        players ?? [],
        (p) => p,
        filter,
        registeredIds,
        (p) => p.id,
      ),
    [players, filter, registeredIds],
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedPlayer | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ManagedPlayer | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    const p = deleteTarget;
    if (!p) return;
    setDeleting(true);
    try {
      await dl.deleteMyPlayer(p.id);
      toast.show(t.players.deleted, "success");
      setDeleteTarget(null);
    } catch (e) {
      const msg =
        e instanceof Error && e.message === "PLAYER_HAS_REGISTRATIONS"
          ? t.players.hasRegistrations
          : t.players.deleteFailed;
      toast.show(msg, "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PublicHeader back="/account" title={t.players.headerTitle} />
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
              const regs = rosterIndex.get(p.id) ?? [];
              return (
                <Card key={p.id} className="flex items-center justify-between p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white/90">
                      {fullNameTh(p)}
                    </p>
                    <p className="text-sm text-white/45">
                      {p.phone} · {powerToLabel(p.powerLevel, locale)}
                    </p>
                    {regs.map((r) => (
                      <div
                        key={r.seatId}
                        className="mt-1.5 flex flex-wrap items-center gap-1.5"
                      >
                        {currentIds.length > 1 && (
                          <span className="text-xs text-white/40">
                            {tournNames.get(r.tournamentId) ??
                              t.myReg.tournamentFallback}
                          </span>
                        )}
                        <Pill tone={r.byMe ? "good" : "neutral"} size="sm">
                          {t.players.regChip(
                            r.categoryCode,
                            t.status[r.batchStatus],
                          )}
                        </Pill>
                        {r.byMe ? (
                          // the owner flow (withdraw / swap / change division)
                          // already lives on /my-registrations
                          <Link
                            href="/my-registrations"
                            className="rounded-lg px-1.5 py-0.5 text-[11px] font-semibold text-brand-300 underline-offset-2 transition hover:bg-brand-500/10 hover:underline"
                          >
                            {t.players.manageOwn}
                          </Link>
                        ) : (
                          <Pill tone="warn" size="sm">
                            {t.players.byOtherAccount}
                          </Pill>
                        )}
                      </div>
                    ))}
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
                      onClick={() => setDeleteTarget(p)}
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

      <ConfirmSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={t.common.delete}
        description={
          deleteTarget
            ? t.players.confirmDelete(fullNameTh(deleteTarget))
            : undefined
        }
        confirmLabel={t.common.delete}
        loading={deleting}
      />
    </>
  );
}
