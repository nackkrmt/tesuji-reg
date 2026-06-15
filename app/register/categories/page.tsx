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
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/form";
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
  categoryId: string;
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
        if (sp.source === "self") {
          return {
            key: "self",
            source: "self",
            person: profile as Profile,
            categoryId: sp.categoryId,
          };
        }
        const pl = sp.playerId ? playerMap.get(sp.playerId) : undefined;
        if (!pl) return null;
        return {
          key: pl.id,
          source: "player",
          playerId: pl.id,
          person: pl,
          categoryId: sp.categoryId,
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

  function setCategory(key: string, categoryId: string) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, categoryId } : r)),
    );
  }

  const total = rows.reduce((sum, r) => {
    const c = cats.find((x) => x.id === r.categoryId);
    return sum + (c?.feeThb ?? 0);
  }, 0);

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
        toast.show(`สมัครได้สูงสุด ${res.max} คน`, "error");
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
      default:
        toast.show("ไม่สามารถจองที่นั่งได้ กรุณาลองใหม่", "error");
    }
  }

  async function onNext() {
    if (!tid || !profile) return;
    if (rows.some((r) => !r.categoryId)) {
      toast.show("กรุณาเลือกรุ่นให้ครบทุกคน", "error");
      return;
    }
    const seats: SeatInput[] = rows.map((r) => ({
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
      categoryId: r.categoryId,
      sourceKind: r.source === "self" ? "self" : "managed_player",
      sourcePlayerId: r.source === "player" ? r.playerId ?? null : null,
    }));

    // persist chosen categories back into the draft
    setParticipants(
      rows.map((r) => ({
        source: r.source,
        playerId: r.playerId,
        categoryId: r.categoryId,
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
      <h2 className="mb-1 text-base font-bold text-slate-900">เลือกรุ่น</h2>
      <p className="mb-3 text-sm text-slate-400">
        เลือกรุ่นที่ต้องการสมัครให้แต่ละคน
      </p>

      <div className="space-y-3">
        {rows.map((r, i) => {
          const selectedCat = cats.find((c) => c.id === r.categoryId);
          return (
            <Card key={r.key} className="p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <p className="font-semibold text-slate-800">
                  {fullNameTh(r.person)}
                </p>
                {r.source === "self" && (
                  <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
                    ฉัน
                  </span>
                )}
                <span className="ml-auto text-xs text-slate-400">
                  ระดับ: {powerToLabel(r.person.powerLevel)}
                </span>
              </div>
              <Select
                value={r.categoryId}
                onChange={(e) => setCategory(r.key, e.target.value)}
              >
                <option value="">— เลือกรุ่น —</option>
                {cats.map((c) => {
                  const rem = remainingSeats(c);
                  const eligible = isRankEligible(
                    r.person.powerLevel,
                    c.minPowerLevel,
                    c.maxPowerLevel,
                  );
                  const full = rem === 0 && c.id !== r.categoryId;
                  return (
                    <option
                      key={c.id}
                      value={c.id}
                      disabled={full || (!eligible && c.id !== r.categoryId)}
                    >
                      {c.code} · {c.name} — {formatThb(c.feeThb)}฿{" "}
                      {rem === 0 ? "(เต็ม)" : `(เหลือ ${rem})`}
                      {!eligible ? " · ระดับไม่ตรงรุ่น" : ""}
                    </option>
                  );
                })}
              </Select>
              {selectedCat && (
                <p className="mt-2 text-right text-sm text-slate-500">
                  ค่าสมัคร {formatThb(selectedCat.feeThb)} บาท
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-50 px-4 py-3">
        <span className="text-sm text-slate-600">ยอดรวม ({rows.length} คน)</span>
        <span className="text-lg font-bold text-brand-800">
          {formatThb(total)} บาท
        </span>
      </div>

      <button
        type="button"
        onClick={() => router.push("/register/applicant")}
        className="mt-3 text-sm font-medium text-slate-500"
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
