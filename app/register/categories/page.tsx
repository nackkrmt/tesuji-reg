"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  ActionBarSpacer,
  StickyActionBar,
} from "@/components/ui/StickyActionBar";

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

  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (initialRows.length) setRows(initialRows);
  }, [initialRows]);

  if (tLoading || !profile) return <CenterLoader label="กำลังโหลด…" />;
  if (!tournament || !tid) {
    return (
      <div className="mx-auto max-w-app px-4 py-6">
        <EmptyState title="ไม่พบรายการแข่งขัน" />
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
          `รุ่น ${res.categoryName} เหลือ ${res.remaining} ที่ (ต้องการ ${res.requested})`,
          "error",
        );
        break;
      case "REGISTRATION_CLOSED":
        toast.show("ขณะนี้ปิดรับสมัครแล้ว", "error");
        break;
      case "TOO_MANY":
        toast.show(`สมัครได้สูงสุด ${res.max} ที่`, "error");
        break;
      case "RANK_NOT_ELIGIBLE":
        toast.show(
          `${res.personLabel} มีระดับฝีมือไม่ตรงกับรุ่น ${res.categoryName}`,
          "error",
        );
        break;
      case "RANK_REQUIRED":
        toast.show(
          `${res.personLabel} ยังไม่ได้ระบุระดับฝีมือ — แก้ไขในโปรไฟล์/ผู้เล่นก่อน`,
          "error",
        );
        break;
      case "AGE_NOT_ELIGIBLE":
        toast.show(
          `${res.personLabel} (อายุ ${res.age} ปี) อายุไม่ตรงกับรุ่น ${res.categoryName}`,
          "error",
        );
        break;
      case "COMBINATION_NOT_ALLOWED":
        toast.show(
          `${res.personLabel} ลงรุ่น ${res.categoryName} คู่กับ ${res.otherCategoryName} ไม่ได้ — 1 คนลงได้รุ่นเดียว ยกเว้นรุ่นที่จับคู่กันไว้`,
          "error",
        );
        break;
      case "DUPLICATE_REGISTRATION":
        toast.show(
          `${res.personLabel} สมัครรุ่น ${res.categoryName} ไว้แล้ว${
            res.referenceCode ? ` (อ้างอิง ${res.referenceCode})` : ""
          }`,
          "error",
        );
        break;
      default:
        toast.show("ไม่สามารถจองที่นั่งได้ กรุณาลองใหม่", "error");
    }
  }

  async function onNext() {
    if (!tid || !profile) return;
    if (rows.some((r) => !r.categoryIds[0])) {
      toast.show("กรุณาเลือกรุ่นให้ครบทุกคน", "error");
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
      if (draft.reservation) {
        await dl.releaseBatch(draft.reservation.batchId);
        setReservation(null);
      }
      const res = await dl.reserveSeats({
        tournamentId: tid,
        kind,
        submitterPhone: profile.phone,
        seats,
      });
      if (!res.ok) {
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
    } finally {
      setReserving(false);
    }
  }

  return (
    <div className="mx-auto max-w-app px-4 py-4">
      <h2 className="mb-1 text-base font-bold text-white">เลือกรุ่น</h2>
      <p className="mb-3 text-sm text-white/45">
        เลือกรุ่นที่ต้องการสมัครให้แต่ละคน · บางรุ่นลงคู่กันได้ (เช่น 9x9 + 13x13)
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
                    ฉัน
                  </span>
                )}
                <span className="ml-auto text-xs text-white/45">
                  ระดับ: {powerToLabel(r.person.powerLevel)}
                </span>
              </div>

              {r.categoryIds.map((catId, si) => {
                // slot 0 → all รุ่น; slot 1 → only รุ่น combinable with the 1st
                const optionCats =
                  si === 0 ? cats : companionCats(r.person, r.categoryIds[0]);
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
                              si === 0 ? "— เลือกรุ่น —" : "— เลือกรุ่นที่ 2 —",
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
                                rem === 0 ? "(เต็ม)" : `(เหลือ ${rem})`
                              }${!eligible ? " · ไม่ตรงเกณฑ์" : ""}`,
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
                        ลบ
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
                  + ลงอีกรุ่น
                </button>
              )}

              {personTotal(r) > 0 && (
                <p className="mt-2 text-right text-sm text-white/55">
                  ค่าสมัคร {formatThb(personTotal(r))} บาท
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-brand-400/20 bg-brand-500/10 px-4 py-3">
        <span className="text-sm text-white/70">ยอดรวม ({seatCount} ที่)</span>
        <span className="text-lg font-bold text-brand-200">
          {formatThb(total)} บาท
        </span>
      </div>

      <button
        type="button"
        onClick={() => router.push("/register/applicant")}
        className="mt-3 text-sm font-medium text-white/50 transition hover:text-white/80"
      >
        ← เปลี่ยนผู้เข้าแข่งขัน
      </button>

      <ActionBarSpacer />
      <StickyActionBar>
        <Button fullWidth onClick={onNext} loading={reserving}>
          ถัดไป
        </Button>
      </StickyActionBar>
    </div>
  );
}
