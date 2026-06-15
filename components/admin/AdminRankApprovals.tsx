"use client";

import { useState } from "react";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import {
  PendingRankRow,
  RankCandidate,
  RankSearchResult,
} from "@/lib/data/types";
import { RANK_OPTIONS, powerToLabel } from "@/lib/rank";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState, Spinner } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";

const SOURCE_LABEL: Record<RankCandidate["source"], string> = {
  dan: "ฐาน Dan",
  kyu: "ฐาน Kyu",
  award: "ฐานรางวัล",
};

export default function AdminRankApprovals() {
  const { data: pending, loading } = useLiveQuery(
    (d) => d.listPendingRanks(),
    [],
  );

  if (loading) return <CenterLoader label="กำลังโหลด…" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">อนุมัติระดับฝีมือ</h1>
        <p className="mt-1 text-sm text-slate-400">
          ผู้ที่ระบุระดับเอง (ไม่พบในฐานข้อมูล) จะรอการอนุมัติที่นี่ ·
          ค้นฐานข้อมูลเพื่อเทียบ แล้วอนุมัติหรือแก้ระดับให้ถูกต้อง
        </p>
      </div>

      {(pending?.length ?? 0) === 0 ? (
        <EmptyState title="ไม่มีรายการรออนุมัติ" />
      ) : (
        <div className="space-y-3">
          {pending!.map((row) => (
            <PendingRankCard key={`${row.kind}:${row.id}`} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function PendingRankCard({ row }: { row: PendingRankRow }) {
  const dl = useDataLayer();
  const toast = useToast();
  const [power, setPower] = useState(
    row.powerLevel != null ? String(row.powerLevel) : "",
  );
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<RankSearchResult | null>(null);

  async function search() {
    setSearching(true);
    setResult(null);
    try {
      const r = await dl.searchRank(row.firstNameTh, row.lastNameTh);
      setResult(r);
    } catch (e) {
      toast.show((e as Error).message || "ค้นหาไม่สำเร็จ", "error");
    } finally {
      setSearching(false);
    }
  }

  async function approve(verified: boolean) {
    if (verified && power === "") {
      toast.show("กรุณาเลือกระดับก่อนอนุมัติ", "error");
      return;
    }
    setBusy(true);
    try {
      await dl.setRankStatus(
        row.kind,
        row.id,
        verified ? "verified" : "pending",
        verified ? Number(power) : null,
      );
      toast.show(verified ? "อนุมัติแล้ว" : "บันทึกแล้ว", "success");
    } catch (e) {
      toast.show((e as Error).message || "ทำรายการไม่สำเร็จ", "error");
      setBusy(false);
    }
    // on success the row drops off the live list; no need to clear busy
  }

  const candidates =
    result && result.status !== "not_found" ? result.candidates : [];

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-800">
            {row.firstNameTh} {row.lastNameTh}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {row.kind === "profile" ? "บัญชีผู้ใช้" : "ผู้เล่นในความดูแล"} ·
            แจ้งระดับ:{" "}
            <span className="font-medium text-amber-600">
              {row.powerLevel != null ? powerToLabel(row.powerLevel) : "—"}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={search}
          disabled={searching}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-200 disabled:opacity-60"
        >
          {searching && <Spinner className="h-3.5 w-3.5" />}
          ค้นฐานข้อมูล
        </button>
      </div>

      {/* search results to help the admin verify */}
      {result && (
        <div className="rounded-xl bg-slate-50 p-2.5">
          {candidates.length === 0 ? (
            <p className="text-xs text-slate-400">ไม่พบชื่อนี้ในฐานข้อมูล</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-400">
                พบ {candidates.length} รายการ — แตะเพื่อใช้ระดับนี้
              </p>
              {candidates.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setPower(String(c.powerLevel))}
                  className="block w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left hover:border-brand-300"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">
                      {c.firstNameTh} {c.lastNameTh}
                    </span>
                    <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {c.rank}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {SOURCE_LABEL[c.source]}
                    {c.evidence[0] ? ` · ${c.evidence[0]}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* override + approve */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[140px] flex-1">
          <Select value={power} onChange={(e) => setPower(e.target.value)}>
            <option value="">— เลือกระดับ —</option>
            {RANK_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={() => approve(true)}
          disabled={busy}
          className="inline-flex h-10 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "กำลังบันทึก…" : "อนุมัติ"}
        </button>
      </div>
    </Card>
  );
}
