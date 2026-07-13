"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SelectedParticipant,
  useRegisterFlow,
} from "@/components/register/RegisterFlowProvider";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import {
  activeRegistrationKeys,
  ManagedPlayer,
  MAX_GROUP_SIZE,
  personMatchKey,
} from "@/lib/data/types";
import { PlayerSheet } from "@/components/account/PlayerSheet";
import {
  applyPlayerFilter,
  DEFAULT_PLAYER_FILTER,
  matchesPlayerQuery,
  matchesRegFilter,
  PlayerFilterBar,
  PlayerFilterState,
} from "@/components/players/PlayerFilterBar";
import { powerToLabel } from "@/lib/rank";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { cn, fullNameTh } from "@/lib/utils";
import {
  ActionBarSpacer,
  StickyActionBar,
} from "@/components/ui/StickyActionBar";
import { useI18n } from "@/lib/i18n";

export default function SelectParticipantsStep() {
  const router = useRouter();
  const dl = useDataLayer();
  const toast = useToast();
  const { t, locale } = useI18n();
  const { draft, setParticipants, setReservation } = useRegisterFlow();

  const { data: profile } = useLiveQuery((d) => d.getMyProfile(), []);
  const { data: players, loading } = useLiveQuery((d) => d.listMyPlayers(), []);
  const { data: registrations } = useLiveQuery(
    (d) => d.listMyRegistrations(),
    [],
  );
  const { data: tournament } = useLiveQuery((d) => d.getActiveTournament(), []);

  // People already holding a live seat in THIS tournament — drives the
  // "entered / not entered" filter and the card tag. Registered players stay
  // selectable: they may still enter a combinable second division.
  const registeredKeys = useMemo(
    () =>
      tournament
        ? activeRegistrationKeys(registrations ?? [], tournament.id)
        : new Set<string>(),
    [registrations, tournament],
  );

  const [filter, setFilter] = useState<PlayerFilterState>(DEFAULT_PLAYER_FILTER);
  const visiblePlayers = useMemo(
    () => applyPlayerFilter(players ?? [], (p) => p, filter, registeredKeys),
    [players, filter, registeredKeys],
  );

  // selection keys: "self" or a player id
  const [selected, setSelected] = useState<Set<string>>(() => {
    const init = new Set<string>(
      draft.participants.map((p) => (p.source === "self" ? "self" : p.playerId!)),
    );
    if (init.size === 0) init.add("self");
    return init;
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  if (loading || !profile) return <CenterLoader label={t.common.loading} />;

  // Self obeys the same search/filter; it just stays pinned on top when shown.
  const selfVisible =
    matchesPlayerQuery(profile, filter.query) &&
    matchesRegFilter(profile, filter.reg, registeredKeys);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else {
        if (next.size >= MAX_GROUP_SIZE) {
          toast.show(t.register.maxSelectable(MAX_GROUP_SIZE), "error");
          return prev;
        }
        next.add(key);
      }
      return next;
    });
  }

  async function onNext() {
    if (selected.size === 0) {
      toast.show(t.register.selectAtLeastOne, "error");
      return;
    }
    // preserve previously-assigned categories when re-selecting the same person
    const prevCat = new Map(
      draft.participants.map((p) => [
        p.source === "self" ? "self" : p.playerId!,
        p.categoryIds,
      ]),
    );
    const participants: SelectedParticipant[] = Array.from(selected).map((key) =>
      key === "self"
        ? { source: "self", categoryIds: prevCat.get("self") ?? [] }
        : {
            source: "player",
            playerId: key,
            categoryIds: prevCat.get(key) ?? [],
          },
    );
    setParticipants(participants);
    if (draft.reservation) {
      // Best-effort: a transient release failure must not trap the user on a dead
      // button. The categories step re-releases any lingering hold before reserving.
      try {
        await dl.releaseBatch(draft.reservation.batchId);
      } catch {
        /* ignore — hold is swept server-side / re-released on next reserve */
      }
      setReservation(null);
    }
    router.push("/register/categories");
  }

  return (
    <div className="mx-auto max-w-app px-4 py-4">
      <h2 className="mb-1 text-base font-bold text-white">{t.register.selectHeading}</h2>
      <p className="mb-3 text-sm text-white/45">
        {t.register.selectHint(MAX_GROUP_SIZE)}
      </p>

      <div className="mb-3 rounded-2xl border border-brand-400/25 bg-brand-400/10 px-4 py-3 text-sm leading-relaxed text-brand-100">
        {t.register.multiSelectCallout(MAX_GROUP_SIZE)}
      </div>

      <PlayerFilterBar value={filter} onChange={setFilter} />

      {!selfVisible && visiblePlayers.length === 0 ? (
        <p className="py-6 text-center text-sm text-white/45">
          {t.playerFilter.noMatch}
        </p>
      ) : (
        <div className="space-y-2.5">
          {selfVisible && (
            <SelectableCard
              checked={selected.has("self")}
              onToggle={() => toggle("self")}
              title={fullNameTh(profile)}
              subtitle={`${t.register.self} · ${powerToLabel(profile.powerLevel, locale)}`}
              tag={t.register.meTag}
              badge={
                registeredKeys.has(personMatchKey(profile))
                  ? t.playerFilter.registeredTag
                  : undefined
              }
            />
          )}
          {visiblePlayers.map((p) => (
            <SelectableCard
              key={p.id}
              checked={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
              title={fullNameTh(p)}
              subtitle={`${p.phone} · ${powerToLabel(p.powerLevel, locale)}`}
              badge={
                registeredKeys.has(personMatchKey(p))
                  ? t.playerFilter.registeredTag
                  : undefined
              }
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 py-3 text-sm font-semibold text-brand-300 transition hover:border-brand-400/40 hover:bg-brand-500/10"
      >
        {t.register.addManagedPlayer}
      </button>

      {selected.size > 0 && (
        <p
          aria-live="polite"
          className="mt-3 text-center text-sm font-medium text-brand-200"
        >
          {t.register.selectedCount(selected.size)}
        </p>
      )}

      <ActionBarSpacer />
      <StickyActionBar>
        <Button fullWidth onClick={onNext}>
          {t.register.nextWithCount(selected.size)}
        </Button>
      </StickyActionBar>

      <PlayerSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={null}
        onSaved={(player: ManagedPlayer) =>
          setSelected((prev) => new Set(prev).add(player.id))
        }
      />
    </div>
  );
}

function SelectableCard({
  checked,
  onToggle,
  title,
  subtitle,
  tag,
  badge,
}: {
  checked: boolean;
  onToggle: () => void;
  title: string;
  subtitle: string;
  tag?: string;
  /** Status chip after the name, e.g. "สมัครแล้ว" for already-entered players. */
  badge?: string;
}) {
  return (
    <Card
      className={cn(
        "flex cursor-pointer items-center gap-3 p-4 transition",
        checked
          ? "border-brand-400/60 ring-2 ring-brand-500/30"
          : "hover-glass",
      )}
    >
      <label className="flex flex-1 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-5 w-5 accent-brand-500"
        />
        <div className="min-w-0">
          <p className="truncate font-semibold text-white/90">
            {title}
            {tag && (
              <span className="ml-2 rounded bg-brand-500/20 px-1.5 py-0.5 text-[11px] font-bold text-brand-200">
                {tag}
              </span>
            )}
            {badge && (
              <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300/90">
                {badge}
              </span>
            )}
          </p>
          <p className="truncate text-sm text-white/45">{subtitle}</p>
        </div>
      </label>
    </Card>
  );
}
