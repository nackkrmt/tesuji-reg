"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Category,
  ManagedPlayer,
  Person,
  RegistrationSeat,
  remainingSeats,
  SwapSeatResult,
} from "@/lib/data/types";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { isRankEligible } from "@/lib/rank";
import { ageFromDob, isAgeEligible } from "@/lib/age";
import { PlayerSheet } from "@/components/account/PlayerSheet";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/form";
import { CenterLoader } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { cn, formatThb, fullNameTh } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Rank + age eligibility vs a division — mirrors the register step + the server
 *  swap_seat gate (which re-checks authoritatively against the DB-read person). */
function eligibleFor(person: Person, c: Category): boolean {
  return (
    isRankEligible(person.powerLevel, c.minPowerLevel, c.maxPowerLevel) &&
    isAgeEligible(ageFromDob(person.dob), c.minAge, c.maxAge)
  );
}

/** Replace one seat's occupant with self / a managed player, optionally moving to
 *  another division of the SAME fee. The division list is filtered client-side to
 *  same-fee + eligible + has-room; the server re-validates everything. */
export function SwapSeatSheet({
  open,
  onClose,
  seat,
  tournamentId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  seat: RegistrationSeat;
  tournamentId: string;
  onDone: () => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const { t } = useI18n();

  const { data: profile } = useLiveQuery((d) => d.getMyProfile(), []);
  const { data: players } = useLiveQuery((d) => d.listMyPlayers(), []);
  const { data: categories } = useLiveQuery(
    (d) => d.listCategories(tournamentId),
    [tournamentId],
  );

  const [selectedKey, setSelectedKey] = useState<string>("self"); // "self" | playerId
  const [categoryId, setCategoryId] = useState<string>(seat.categoryId);
  const [playerSheetOpen, setPlayerSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedKey("self");
      setCategoryId(seat.categoryId);
      setSubmitting(false);
    }
  }, [open, seat.id, seat.categoryId]);

  const person: Person | null =
    selectedKey === "self"
      ? profile ?? null
      : (players ?? []).find((p) => p.id === selectedKey) ?? null;

  // Divisions the new person may take at the SAME fee: the current one always
  // (no move, no capacity check) plus other same-fee, eligible, non-full ones.
  const options = useMemo(() => {
    if (!person || !categories) return [];
    return categories
      .filter(
        (c) =>
          (c.id === seat.categoryId || c.feeThb === seat.feeThbSnapshot) &&
          eligibleFor(person, c) &&
          (c.id === seat.categoryId || remainingSeats(c) > 0),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [person, categories, seat.categoryId, seat.feeThbSnapshot]);

  // keep the chosen division valid as the selected person changes
  useEffect(() => {
    if (options.length === 0) return;
    if (!options.some((c) => c.id === categoryId)) setCategoryId(options[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  function showSwapError(res: Exclude<SwapSeatResult, { ok: true }>) {
    switch (res.error) {
      case "INSUFFICIENT_SEATS":
        toast.show(
          t.register.errInsufficientSeats(
            res.categoryName,
            res.remaining,
            res.requested,
          ),
          "error",
        );
        break;
      case "RANK_NOT_ELIGIBLE":
        toast.show(
          t.register.errRankNotEligible(res.personLabel, res.categoryName),
          "error",
        );
        break;
      case "RANK_REQUIRED":
        toast.show(t.register.errRankRequired(res.personLabel), "error");
        break;
      case "AGE_NOT_ELIGIBLE":
        toast.show(
          t.register.errAgeNotEligible(res.personLabel, res.age, res.categoryName),
          "error",
        );
        break;
      case "COMBINATION_NOT_ALLOWED":
        toast.show(
          t.register.errCombinationNotAllowed(
            res.personLabel,
            res.categoryName,
            res.otherCategoryName,
          ),
          "error",
        );
        break;
      case "DUPLICATE_REGISTRATION":
        toast.show(
          t.register.errDuplicate(
            res.personLabel,
            res.categoryName,
            res.referenceCode ?? null,
          ),
          "error",
        );
        break;
      case "AWARD_LIMIT_REACHED":
        toast.show(
          t.register.errAwardLimitReached(res.personLabel, res.awardCount),
          "error",
        );
        break;
      case "FEE_MISMATCH":
        toast.show(t.swap.errFeeMismatch, "error");
        break;
      case "SWAP_CLOSED":
        toast.show(t.swap.errClosed, "error");
        break;
      case "SAME_PERSON":
        toast.show(t.swap.errSamePerson, "error");
        break;
      case "ALREADY_WITHDRAWN":
        toast.show(t.swap.errAlready, "error");
        break;
      default:
        toast.show(t.swap.errGeneric, "error");
    }
  }

  async function onConfirm() {
    if (!person || !categoryId) return;
    setSubmitting(true);
    try {
      const res = await dl.swapSeat({
        seatId: seat.id,
        sourceKind: selectedKey === "self" ? "self" : "managed_player",
        sourcePlayerId: selectedKey === "self" ? null : selectedKey,
        categoryId,
      });
      if (res.ok) {
        toast.show(t.swap.success, "success");
        onDone();
        onClose();
        return;
      }
      showSwapError(res);
    } catch {
      toast.show(t.swap.errGeneric, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const loading = !profile || !categories;

  return (
    <>
      {/* Hide (unmount) the swap sheet while the add-player sheet is open, so the
          two never fight over body-scroll lock / z-index. State is preserved. */}
      <Sheet
        open={open && !playerSheetOpen}
        onClose={onClose}
        title={t.swap.title}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              {t.swap.cancel}
            </Button>
            <Button
              fullWidth
              onClick={onConfirm}
              loading={submitting}
              disabled={loading || !person || options.length === 0}
            >
              {t.swap.confirm}
            </Button>
          </div>
        }
      >
        {loading ? (
          <CenterLoader />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-white/55">{t.swap.intro}</p>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs leading-relaxed text-white/55">
              {t.swap.feeNote(formatThb(seat.feeThbSnapshot))}
            </div>

            {/* person picker */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white/80">
                {t.swap.pickPerson}
              </p>
              <PersonRadio
                checked={selectedKey === "self"}
                onSelect={() => setSelectedKey("self")}
                title={profile ? fullNameTh(profile) : ""}
                subtitle={t.swap.self}
                tag={t.swap.meTag}
              />
              {(players ?? []).map((p) => (
                <PersonRadio
                  key={p.id}
                  checked={selectedKey === p.id}
                  onSelect={() => setSelectedKey(p.id)}
                  title={fullNameTh(p)}
                  subtitle={p.phone}
                />
              ))}
              <button
                type="button"
                onClick={() => setPlayerSheetOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/15 py-2.5 text-sm font-semibold text-brand-300 transition hover:border-brand-400/40 hover:bg-brand-500/10"
              >
                {t.swap.addPlayer}
              </button>
            </div>

            {/* division select (same-fee, eligible, non-full only) */}
            <Field label={t.swap.pickDivision}>
              {options.length === 0 ? (
                <p className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
                  {t.swap.noEligible}
                </p>
              ) : (
                <Select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  {options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        )}
      </Sheet>

      <PlayerSheet
        open={playerSheetOpen}
        onClose={() => setPlayerSheetOpen(false)}
        editing={null}
        onSaved={(player: ManagedPlayer) => setSelectedKey(player.id)}
      />
    </>
  );
}

function PersonRadio({
  checked,
  onSelect,
  title,
  subtitle,
  tag,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
  tag?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition",
        checked
          ? "border-brand-400/60 bg-brand-500/10 ring-2 ring-brand-500/30"
          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onSelect}
        className="h-4 w-4 shrink-0 accent-brand-500"
      />
      <div className="min-w-0">
        <p className="truncate font-semibold text-white/90">
          {title}
          {tag && (
            <span className="ml-2 rounded bg-brand-500/20 px-1.5 py-0.5 text-[11px] font-bold text-brand-200">
              {tag}
            </span>
          )}
        </p>
        <p className="truncate text-sm text-white/45">{subtitle}</p>
      </div>
    </label>
  );
}
