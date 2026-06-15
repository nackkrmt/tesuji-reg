"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  GoPlayerSource,
  RankCandidate,
  RankSearchResult,
  RankStatus,
} from "@/lib/data/types";
import { RANK_OPTIONS, powerToLabel } from "@/lib/rank";
import { useDataLayer } from "@/lib/data/store";
import { getByPath } from "@/lib/utils";
import { Field, Select } from "@/components/ui/form";
import { Spinner } from "@/components/ui/feedback";

const SOURCE_LABEL: Record<GoPlayerSource, string> = {
  dan: "ฐาน Dan",
  kyu: "ฐาน Kyu",
  award: "ฐานรางวัล",
};

const MATCH_LABEL: Record<RankCandidate["matchType"], string> = {
  exact: "ตรงทุกตัวอักษร",
  normalized: "ตรงหลังปรับรูปคำ",
  fuzzy: "ใกล้เคียง",
};

export function RankPicker({ prefix = "" }: { prefix?: string }) {
  const { watch, setValue, formState } = useFormContext();
  const dl = useDataLayer();
  const name = (n: string) => `${prefix}${n}`;

  const firstNameTh = ((watch(name("firstNameTh")) as string) ?? "").trim();
  const lastNameTh = ((watch(name("lastNameTh")) as string) ?? "").trim();
  const powerLevel = (watch(name("powerLevel")) as string) ?? "";
  const rankStatus = (watch(name("rankStatus")) as RankStatus) ?? "pending";
  const matchedId = watch(name("matchedGoPlayerId")) as string | null;
  const errMsg = (
    getByPath(formState.errors, name("powerLevel")) as
      | { message?: string }
      | undefined
  )?.message;

  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<RankSearchResult | null>(null);
  const [manual, setManual] = useState(false);
  const [searchErr, setSearchErr] = useState<string>();

  function applyCandidate(c: RankCandidate) {
    setValue(name("powerLevel"), String(c.powerLevel), { shouldValidate: true });
    setValue(name("rankStatus"), "verified");
    setValue(name("matchedGoPlayerId"), c.id);
    setResult(null);
    setManual(false);
  }

  function applyManual(v: string) {
    setValue(name("powerLevel"), v, { shouldValidate: true });
    setValue(name("rankStatus"), "pending");
    setValue(name("matchedGoPlayerId"), null);
  }

  async function search() {
    if (!firstNameTh || !lastNameTh) {
      setSearchErr("กรอกชื่อและนามสกุล (ไทย) ก่อนตรวจสอบ");
      return;
    }
    setSearching(true);
    setSearchErr(undefined);
    setResult(null);
    setManual(false);
    try {
      const r = await dl.searchRank(firstNameTh, lastNameTh);
      setResult(r);
      if (r.status === "matched") applyCandidate(r.candidate);
      if (r.status === "not_found") setManual(true);
    } catch (e) {
      setSearchErr((e as Error).message || "ค้นหาไม่สำเร็จ");
    } finally {
      setSearching(false);
    }
  }

  const hasValue = powerLevel !== "";
  const candidates =
    result && result.status !== "not_found" ? result.candidates : [];

  return (
    <Field
      label="ระดับฝีมือ"
      required
      error={errMsg}
      hint="ตรวจสอบจากฐานข้อมูลด้วยชื่อ-นามสกุล หรือระบุเอง (รอแอดมินอนุมัติ)"
    >
      <div className="space-y-3">
        {/* current value badge */}
        {hasValue && !manual && candidates.length === 0 && (
          <div
            className={
              rankStatus === "verified"
                ? "flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
                : "flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
            }
          >
            <div className="text-sm">
              <span
                className={
                  rankStatus === "verified"
                    ? "font-semibold text-emerald-700"
                    : "font-semibold text-amber-700"
                }
              >
                {rankStatus === "verified"
                  ? "✓ ยืนยันจากฐานข้อมูล"
                  : "● ระบุเอง (รออนุมัติ)"}
              </span>
              <span className="ml-2 text-slate-700">
                {powerToLabel(Number(powerLevel))}
              </span>
            </div>
          </div>
        )}

        {/* search + manual toggle buttons */}
        {!manual && candidates.length === 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={search}
              disabled={searching}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-100 px-4 text-sm font-semibold text-brand-800 hover:bg-brand-200 disabled:opacity-60"
            >
              {searching && <Spinner className="h-4 w-4" />}
              {searching
                ? "กำลังค้นหา…"
                : hasValue
                  ? "ตรวจสอบใหม่จากฐานข้อมูล"
                  : "ตรวจสอบจากฐานข้อมูล"}
            </button>
            <button
              type="button"
              onClick={() => setManual(true)}
              className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-slate-500 hover:bg-slate-100"
            >
              ระบุระดับเอง
            </button>
          </div>
        )}

        {searchErr && <p className="text-sm text-rose-600">{searchErr}</p>}

        {/* candidate list (matched / multiple) */}
        {candidates.length > 0 && !manual && (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">
              {result?.status === "matched"
                ? "พบรายชื่อที่ตรง — ยืนยันด้านล่าง หรือเลือกใหม่"
                : `พบ ${candidates.length} รายชื่อที่ใกล้เคียง — เลือกของคุณ`}
            </p>
            {candidates.map((c) => {
              const isMatched = matchedId === c.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => applyCandidate(c)}
                  className={
                    isMatched
                      ? "block w-full rounded-xl border-2 border-brand-500 bg-brand-50 p-3 text-left"
                      : "block w-full rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">
                      {c.firstNameTh} {c.lastNameTh}
                    </span>
                    <span className="rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">
                      {c.rank}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                    <span>{SOURCE_LABEL[c.source]}</span>
                    <span>·</span>
                    <span>{MATCH_LABEL[c.matchType]}</span>
                    {c.matchType === "fuzzy" && (
                      <span>· {Math.round(c.similarityScore * 100)}%</span>
                    )}
                  </div>
                  {c.evidence.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                      {c.evidence.map((e, i) => (
                        <li key={i}>· {e}</li>
                      ))}
                    </ul>
                  )}
                  {isMatched && (
                    <p className="mt-1 text-xs font-semibold text-brand-700">
                      ✓ เลือกไว้
                    </p>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setManual(true)}
              className="text-sm font-medium text-slate-500 underline-offset-2 hover:underline"
            >
              ไม่มีฉันในรายการ — ระบุระดับเอง
            </button>
          </div>
        )}

        {/* manual self-declare */}
        {manual && (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">
              {result?.status === "not_found"
                ? "ไม่พบชื่อในฐานข้อมูล — ระบุระดับฝีมือเอง ระบบจะตั้งเป็น “รออนุมัติ” จนแอดมินตรวจสอบ"
                : "ระบุระดับฝีมือเอง — ระบบจะตั้งเป็น “รออนุมัติ” จนแอดมินตรวจสอบ"}
            </p>
            <Select
              value={rankStatus === "pending" ? powerLevel : ""}
              onChange={(e) => applyManual(e.target.value)}
              invalid={!!errMsg}
            >
              <option value="">— เลือกระดับฝีมือ —</option>
              {RANK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
            <button
              type="button"
              onClick={() => {
                setManual(false);
                if (candidates.length === 0) setResult(null);
              }}
              className="text-sm font-medium text-slate-500 underline-offset-2 hover:underline"
            >
              {candidates.length > 0
                ? "กลับไปดูรายชื่อที่พบ"
                : "ปิด แล้วค้นจากฐานข้อมูลแทน"}
            </button>
          </div>
        )}
      </div>
    </Field>
  );
}
