"use client";

import { FormEvent, useState } from "react";
import {
  AdminPersonSearchResult,
  REGISTRATION_STATUS_LABEL,
} from "@/lib/data/types";
import { powerToLabel } from "@/lib/rank";
import { useDataLayer } from "@/lib/data/store";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/form";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { RankHistoryList } from "@/components/register/RankHistory";

/** Mirrors the RPC's p_limit — used only to detect a truncated result set. */
const LIMIT = 20;

export default function AdminPeoplePage() {
  const dl = useDataLayer();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  // null = ยังไม่ได้ค้น (shows the hint, not the empty state)
  const [results, setResults] = useState<AdminPersonSearchResult[] | null>(
    null,
  );

  async function search(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setLoading(true);
    setError(undefined);
    try {
      setResults(await dl.adminSearchPersonHistory(q));
    } catch (err) {
      setError((err as Error).message || "ค้นหาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="ประวัตินักกีฬา"
        description="ค้นชื่อ (พิมพ์บางส่วนได้) เพื่อดูประวัติจากฐาน Dan/Kyu/รางวัล — สอบผ่านอะไร ได้รางวัลรุ่นไหน seq/gat — พร้อมสถานะในระบบ: โปรไฟล์ นักกีฬาในสังกัด และการสมัครแข่งขัน"
      />
      <div className="space-y-4">
        <form onSubmit={search} className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40">
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อ / นามสกุล (อย่างน้อย 2 ตัวอักษร)"
              className="pl-10"
            />
          </div>
          <Button
            type="submit"
            loading={loading}
            disabled={query.trim().length < 2}
          >
            ค้นหา
          </Button>
        </form>

        {error && <p className="text-sm text-rose-300">{error}</p>}

        {loading ? (
          <CenterLoader label="กำลังค้นหา…" />
        ) : results === null ? (
          <p className="text-sm text-white/40">
            พิมพ์ชื่อหรือนามสกุล (บางส่วนได้) แล้วกดค้นหา
          </p>
        ) : results.length === 0 ? (
          <EmptyState
            title="ไม่พบ"
            description="ไม่พบชื่อนี้ทั้งในฐานข้อมูลระดับฝีมือและในระบบ"
          />
        ) : (
          <>
            {results.length >= LIMIT && (
              <p className="text-xs text-amber-200/80">
                แสดง {LIMIT} รายการแรก — พิมพ์ชื่อให้เจาะจงขึ้นเพื่อให้ผลแคบลง
              </p>
            )}
            <div className="space-y-3">
              {results.map((p) => (
                <PersonCard key={p.personId} p={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function PersonCard({ p }: { p: AdminPersonSearchResult }) {
  const inSystem = p.profiles.length + p.managedPlayers.length > 0;
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-white/90">
          {p.firstNameTh} {p.lastNameTh}
        </span>
        <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
          {powerToLabel(p.powerLevel)}
        </span>
      </div>

      {p.isAmbiguous && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100/90">
          ชื่อนี้มีข้อมูลระดับขัดแย้งกันในฐานข้อมูล (อาจเป็นคนละคนชื่อซ้ำกัน) —
          ระดับที่แสดงอาจไม่ชี้ขาด
        </p>
      )}

      <div>
        <p className="text-xs font-semibold text-white/70">
          ประวัติจากฐานข้อมูล
          {p.history.length > 0 ? ` (${p.history.length})` : ""}
        </p>
        <div className="mt-1">
          {p.history.length > 0 ? (
            <RankHistoryList entries={p.history} />
          ) : (
            <p className="text-xs text-white/40">
              ไม่มีประวัติในฐาน Dan/Kyu/รางวัล
            </p>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-white/70">สถานะในระบบ</p>
        <div className="mt-1 space-y-0.5 text-xs text-white/55">
          {!inSystem ? (
            <p className="text-white/40">
              ไม่พบในระบบ (ยังไม่มีโปรไฟล์/นักกีฬาที่ลิงก์ชื่อนี้)
            </p>
          ) : (
            <>
              {p.profiles.map((x) => (
                <p key={x.id}>
                  · โปรไฟล์: {x.firstNameTh} {x.lastNameTh} ·{" "}
                  {powerToLabel(x.powerLevel)}
                  {x.rankSelfDeclared ? " · กรอกระดับเอง" : ""}
                  {x.phone ? ` · ${x.phone}` : ""}
                </p>
              ))}
              {p.managedPlayers.map((x) => (
                <p key={x.id}>
                  · นักกีฬาในสังกัด
                  {x.ownerLabel ? `ของ ${x.ownerLabel}` : ""}: {x.firstNameTh}{" "}
                  {x.lastNameTh} · {powerToLabel(x.powerLevel)}
                  {x.rankSelfDeclared ? " · กรอกระดับเอง" : ""}
                </p>
              ))}
            </>
          )}
        </div>
      </div>

      {(inSystem || p.seats.length > 0) && (
        <div>
          <p className="text-xs font-semibold text-white/70">การสมัครแข่งขัน</p>
          <div className="mt-1 space-y-0.5 text-xs text-white/55">
            {p.seats.length === 0 ? (
              <p className="text-white/40">ยังไม่ได้สมัครรุ่นใด</p>
            ) : (
              p.seats.map((s, i) => (
                <p key={i}>
                  · {s.categoryName} ({s.tournamentName}) —{" "}
                  {s.withdrawn
                    ? "ถอนตัวแล้ว"
                    : REGISTRATION_STATUS_LABEL[s.status]}{" "}
                  · {s.batchReference}
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
