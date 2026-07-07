"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRegisterFlow } from "@/components/register/RegisterFlowProvider";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import {
  Category,
  ManagedPlayer,
  Person,
  Profile,
  remainingSeats,
  ReserveSeatsResult,
  SeatInput,
} from "@/lib/data/types";
import { isRankEligible, powerToLabel } from "@/lib/rank";
import { ageFromDob, isAgeEligible } from "@/lib/age";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Combobox } from "@/components/ui/Combobox";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { formatThb, fullNameTh } from "@/lib/utils";
import { isTransientError, withRetry } from "@/lib/retry";
import {
  ActionBarSpacer,
  StickyActionBar,
} from "@/components/ui/StickyActionBar";
import { useI18n } from "@/lib/i18n";

interface Row {
  key: string; // "self" | playerId
  source: "self" | "player";
  playerId?: string;
  person: Person;
  categoryIds: string[]; // 1–2 chosen รุ่น ("" = empty slot)
}

/** Two รุ่น may be entered together when EITHER lists the other as combinable. */
function combinable(a: Category, b: Category): boolean {
  return (
    a.id !== b.id &&
    (a.combinableCategoryIds.includes(b.id) ||
      b.combinableCategoryIds.includes(a.id))
  );
}

function eligibleFor(person: Person, c: Category): boolean {
  return (
    isRankEligible(person.powerLevel, c.minPowerLevel, c.maxPowerLevel) &&
    isAgeEligible(ageFromDob(person.dob), c.minAge, c.maxAge)
  );
}

export default function AssignDivisionStep() {
  const router = useRouter();
  const dl = useDataLayer();
  const toast = useToast();
  const { t, locale } = useI18n();
  const { draft, setParticipants, setReservation } = useRegisterFlow();

  const { data: tournament, loading: tLoading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  const tid = tournament?.id;
  const { data: categories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
  );
  const { data: profile } = useLiveQuery((d) => d.getMyProfile(), []);
  const { data: players } = useLiveQuery((d) => d.listMyPlayers(), []);

  const [reserving, setReserving] = useState(false);

  // Guard: must have selected participants in Step A.
  useEffect(() => {
    if (draft.participants.length === 0) router.replace("/register/applicant");
  }, [draft.participants.length, router]);

  // Resolve selected participants → editable rows with person snapshots.
  const initialRows = useMemo<Row[]>(() => {
    if (!profile) return [];
    const playerMap = new Map<string, ManagedPlayer>(
      (players ?? []).map((p) => [p.id, p]),
    );
    return draft.participants
      .map((sp): Row | null => {
        const categoryIds = sp.categoryIds.length ? [...sp.categoryIds] : [""];
        if (sp.source === "self") {
          return {
            key: "self",
            source: "self",
            person: profile as Profile,
            categoryIds,
          };
        }
        const pl = sp.playerId ? playerMap.get(sp.playerId) : undefined;
        if (!pl) return null;
        return {
          key: pl.id,
          source: "player",
          playerId: pl.id,
          person: pl,
          categoryIds,
        };
      })
      .filter((r): r is Row => r !== null);
  }, [draft.participants, profile, players]);

  // Seed the editable rows from the draft ONCE. initialRows gets a fresh identity on
  // every data-layer notify() (e.g. a Supabase token refresh re-runs the live queries
  // and getMyProfile/listMyPlayers return new object refs), so re-seeding on each change
  // would silently wipe the user's in-progress รุ่น selections. Guard with a ref.
  const [rows, setRows] = useState<Row[]>([]);
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && initialRows.length) {
      setRows(initialRows);
      seededRef.current = true;
    }
  }, [initialRows]);

  if (tLoading || !profile) return <CenterLoader label={t.common.loading} />;
  if (!tournament || !tid) {
    return (
      <div className="mx-auto max-w-app px-4 py-6">
        <EmptyState title={t.register.noTournament} />
      </div>
    );
  }

  const cats: Category[] = categories ?? [];
  const catById = (id: string) => cats.find((c) => c.id === id);

  /** รุ่น offered for a person's 2nd slot: eligible + combinable with the 1st. */
  function companionCats(person: Person, firstId: string): Category[] {
    const first = catById(firstId);
    if (!first) return [];
    return cats.filter((c) => combinable(first, c) && eligibleFor(person, c));
  }

  function setCategoryAt(key: string, slot: number, categoryId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = [...r.categoryIds];
        next[slot] = categoryId;
        // changing the 1st รุ่น can invalidate the 2nd → clear if no longer a pair
        if (slot === 0 && next.length > 1) {
          const a = catById(categoryId);
          const b = catById(next[1]);
          if (!a || !b || !combinable(a, b)) next[1] = "";
        }
        return { ...r, categoryIds: next };
      }),
    );
  }

  function addSlot(key: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key && r.categoryIds.length < 2
          ? { ...r, categoryIds: [...r.categoryIds, ""] }
          : r,
      ),
    );
  }

  function removeSlot(key: string, slot: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? { ...r, categoryIds: r.categoryIds.filter((_, i) => i !== slot) }
          : r,
      ),
    );
  }

  const personTotal = (r: Row) =>
    r.categoryIds.reduce((sum, id) => sum + (catById(id)?.feeThb ?? 0), 0);
  const total = rows.reduce((sum, r) => sum + personTotal(r), 0);
  const seatCount = rows.reduce(
    (n, r) => n + new Set(r.categoryIds.filter(Boolean)).size,
    0,
  );

  function showReserveError(res: Exclude<ReserveSeatsResult, { ok: true }>) {
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
      case "REGISTRATION_CLOSED":
        toast.show(t.register.errRegistrationClosed, "error");
        break;
      case "TOO_MANY":
        toast.show(t.register.errTooMany(res.max), "error");
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
          t.register.errAgeNotEligible(
            res.personLabel,
            res.age,
            res.categoryName,
          ),
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
      default:
        toast.show(t.register.errReserveFailed, "error");
    }
  }

  async function onNext() {
    if (!tid || !profile) return;
    if (rows.some((r) => !r.categoryIds[0])) {
      toast.show(t.register.selectAllCategories, "error");
      return;
    }
    const seats: SeatInput[] = rows.flatMap((r) => {
      const chosen = Array.from(new Set(r.categoryIds.filter(Boolean)));
      return chosen.map((categoryId) => ({
        titlePrefix: r.person.titlePrefix,
        titleCustom: r.person.titleCustom ?? null,
        firstNameTh: r.person.firstNameTh,
        lastNameTh: r.person.lastNameTh,
        firstNameEn: r.person.firstNameEn,
        lastNameEn: r.person.lastNameEn,
        hasMiddleName: r.person.hasMiddleName,
        middleNameTh: r.person.middleNameTh ?? null,
        middleNameEn: r.person.middleNameEn ?? null,
        phone: r.person.phone,
        dob: r.person.dob,
        powerLevel: r.person.powerLevel ?? null,
        province: r.person.province ?? null,
        instituteId: r.person.instituteId ?? null,
        instituteName: r.person.instituteName ?? null,
        pdpaConsent: r.person.pdpaConsent ?? false,
        pdpaConsentAt: r.person.pdpaConsentAt ?? null,
        categoryId,
        sourceKind: r.source === "self" ? "self" : "managed_player",
        sourcePlayerId: r.source === "player" ? r.playerId ?? null : null,
      }));
    });

    // persist chosen รุ่น back into the draft
    setParticipants(
      rows.map((r) => ({
        source: r.source,
        playerId: r.playerId,
        categoryIds: Array.from(new Set(r.categoryIds.filter(Boolean))),
      })),
    );

    const kind =
      rows.length === 1 && rows[0].source === "self" ? "self" : "group";

    setReserving(true);
    try {
      // Release any prior pending hold for this tournament — the one we know
      // about, plus any orphaned by a lost response on a previous attempt —
      // then reserve. Retried as a unit on transient failures: a retry redoes
      // the cleanup first, so a hold created by an attempt whose response was
      // lost gets released before the next attempt creates a new one, so this
      // can never double-book seats for the same user.
      await withRetry(async () => {
        try {
          const mine = await dl.listMyRegistrations();
          await Promise.all(
            mine
              .filter(
                (r) =>
                  r.batch.tournamentId === tid &&
                  r.batch.status === "pending_payment",
              )
              .map((r) => dl.releaseBatch(r.batch.id).catch(() => {})),
          );
        } catch {
          // best-effort cleanup; the reserve below still proceeds
        }
        setReservation(null);

        const res = await dl.reserveSeats({
          tournamentId: tid,
          kind,
          submitterPhone: profile.phone,
          seats,
        });
        if (!res.ok) {
          // Business rejection (INSUFFICIENT_SEATS, RANK_NOT_ELIGIBLE, …) —
          // not a thrown error, so withRetry won't retry it.
          showReserveError(res);
          return;
        }
        setReservation({
          batchId: res.batchId,
          holdId: res.holdId,
          expiresAt: res.expiresAt,
          totalAmountThb: res.totalAmountThb,
          referenceCode: res.referenceCode,
          tournamentId: tid,
        });
        router.push("/register/payment");
      });
    } catch (e) {
      // Retries exhausted on a transient failure, or a non-transient throw.
      console.error("reserveSeats failed", e);
      toast.show(
        isTransientError(e)
          ? t.register.errBusyRetryConfirm
          : t.register.errReserveFailed,
        "error",
      );
    } finally {
      setReserving(false);
    }
  }

  return (
    <div className="mx-auto max-w-app px-4 py-4">
      <h2 className="mb-1 text-base font-bold text-white">{t.register.chooseHeading}</h2>
      <p className="mb-3 text-sm text-white/45">
        {t.register.chooseHint}
      </p>

      <div className="space-y-3">
        {rows.map((r, i) => {
          const companions = r.categoryIds[0]
            ? companionCats(r.person, r.categoryIds[0])
            : [];
          const canAdd = r.categoryIds.length < 2 && companions.length > 0;
          return (
            <Card key={r.key} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <p className="font-semibold text-white/90">
                  {fullNameTh(r.person)}
                </p>
                {r.source === "self" && (
                  <span className="rounded bg-brand-500/20 px-1.5 py-0.5 text-[11px] font-bold text-brand-200">
                    {t.register.meTag}
                  </span>
                )}
                <span className="ml-auto text-xs text-white/45">
                  {t.register.levelPrefix(powerToLabel(r.person.powerLevel, locale))}
                </span>
              </div>

              {r.categoryIds.map((catId, si) => {
                // slot 0 → รุ่น this person is eligible for; slot 1 → only รุ่น
                // combinable with the 1st (companionCats already filters eligible).
                // Keep an already-chosen รุ่น visible even if it wouldn't re-pass.
                const optionCats =
                  si === 0
                    ? cats.filter(
                        (c) => eligibleFor(r.person, c) || c.id === catId,
                      )
                    : companionCats(r.person, r.categoryIds[0]);
                // No รุ่น matches this person's rank/age → say so plainly instead
                // of showing a picker with nothing selectable in it.
                if (si === 0 && optionCats.length === 0) {
                  return (
                    <div
                      key={si}
                      className="mt-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-3.5 py-2.5 text-sm text-amber-200"
                    >
                      {t.register.noEligibleCategory}
                    </div>
                  );
                }
                return (
                  <div key={si} className="mt-2 flex items-center gap-2">
                    <div className="flex-1">
                      <Combobox
                        value={catId}
                        onChange={(v) => setCategoryAt(r.key, si, v)}
                        options={[
                          {
                            value: "",
                            label:
                              si === 0
                                ? t.register.selectCategory1
                                : t.register.selectCategory2,
                          },
                          ...optionCats.map((c) => {
                            const rem = remainingSeats(c);
                            const eligible = eligibleFor(r.person, c);
                            const full = rem === 0 && c.id !== catId;
                            // prevent picking the same รุ่น in both slots
                            const usedElsewhere = r.categoryIds.some(
                              (x, xi) => xi !== si && x === c.id,
                            );
                            return {
                              value: c.id,
                              label: `${c.code} · ${c.name} — ${formatThb(c.feeThb)}฿ ${
                                rem === 0
                                  ? t.register.seatsFull
                                  : t.register.seatsRemaining(rem)
                              }${!eligible ? t.register.notEligibleSuffix : ""}`,
                              disabled:
                                full || usedElsewhere || (!eligible && c.id !== catId),
                            };
                          }),
                        ]}
                      />
                    </div>
                    {si > 0 && (
                      <button
                        type="button"
                        onClick={() => removeSlot(r.key, si)}
                        className="shrink-0 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10"
                      >
                        {t.register.removeSlot}
                      </button>
                    )}
                  </div>
                );
              })}

              {canAdd && (
                <button
                  type="button"
                  onClick={() => addSlot(r.key)}
                  className="mt-2 text-sm font-semibold text-brand-300 hover:text-brand-200"
                >
                  {t.register.addAnotherCategory}
                </button>
              )}

              {personTotal(r) > 0 && (
                <p className="mt-2 text-right text-sm text-white/55">
                  {t.register.personFee(formatThb(personTotal(r)))}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-brand-400/20 bg-brand-500/10 px-4 py-3">
        <span className="text-sm text-white/70">{t.register.totalWithSeats(seatCount)}</span>
        <span className="text-lg font-bold text-brand-200">
          {t.register.amountBaht(formatThb(total))}
        </span>
      </div>

      <button
        type="button"
        onClick={() => router.push("/register/applicant")}
        className="mt-3 text-sm font-medium text-white/50 transition hover:text-white/80"
      >
        {t.register.changeParticipants}
      </button>

      <ActionBarSpacer />
      <StickyActionBar>
        <Button fullWidth onClick={onNext} loading={reserving}>
          {t.register.next}
        </Button>
      </StickyActionBar>
    </div>
  );
}
