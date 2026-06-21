"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "@/lib/data/store";
import { ParticipantRow } from "@/lib/data/types";
import { PublicHeader } from "@/components/PublicHeader";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { TextInput } from "@/components/ui/form";

interface Group {
  code: string;
  name: string;
  rows: ParticipantRow[];
}

export default function ParticipantsClient() {
  const { data: tournament, loading: tLoading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  const tid = tournament?.id;
  const { data: rows, loading } = useLiveQuery(
    (d) => (tid ? d.listParticipants(tid) : Promise.resolve([])),
    [tid],
  );
  const [q, setQ] = useState("");

  const groups = useMemo<Group[]>(() => {
    const filtered = (rows ?? []).filter((r) =>
      q.trim() ? r.fullNameTh.includes(q.trim()) : true,
    );
    const byCode = new Map<string, Group>();
    for (const r of filtered) {
      let g = byCode.get(r.categoryCode);
      if (!g) {
        g = { code: r.categoryCode, name: r.categoryName, rows: [] };
        byCode.set(r.categoryCode, g);
      }
      g.rows.push(r);
    }
    return Array.from(byCode.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  }, [rows, q]);

  const total = rows?.length ?? 0;
  const confirmedCount = (rows ?? []).filter(
    (r) => r.status === "confirmed",
  ).length;
  const pendingCount = total - confirmedCount;

  return (
    <>
      <PublicHeader back="/" title="รายชื่อผู้เข้าแข่งขัน" />
      <main className="mx-auto max-w-app px-4 pb-dock pt-4">
        {tLoading || loading ? (
          <CenterLoader label="กำลังโหลด…" />
        ) : total === 0 ? (
          <EmptyState
            title="ยังไม่มีผู้สมัคร"
            description="รายชื่อจะปรากฏที่นี่เมื่อมีผู้สมัครเข้ามา"
          />
        ) : (
          <div className="space-y-4">
            <div>
              <TextInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาชื่อ…"
              />
              <p className="mt-2 text-sm text-white/45">
                ผู้สมัครทั้งหมด {total} คน
                {pendingCount > 0 && (
                  <>
                    {" "}
                    · ยืนยันแล้ว {confirmedCount} · รอตรวจสอบ {pendingCount}
                  </>
                )}
              </p>
            </div>

            {groups.length === 0 ? (
              <EmptyState title="ไม่พบชื่อที่ค้นหา" />
            ) : (
              groups.map((g) => (
                <Card key={g.code} className="overflow-hidden">
                  <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
                    <span className="rounded-lg bg-brand-500/20 px-2 py-0.5 text-xs font-bold text-brand-200 ring-1 ring-inset ring-brand-400/25">
                      {g.code}
                    </span>
                    <span className="font-semibold text-white/80">
                      {g.name}
                    </span>
                    <span className="ml-auto text-sm text-white/45">
                      {g.rows.length} คน
                    </span>
                  </div>
                  <ol className="divide-y divide-white/[0.07]">
                    {g.rows.map((r, i) => (
                      <li
                        key={`${r.fullNameTh}-${i}`}
                        className="flex items-center gap-3 px-4 py-2.5"
                      >
                        <span className="w-6 text-right text-sm text-white/30">
                          {i + 1}
                        </span>
                        <span className="text-white/85">{r.fullNameTh}</span>
                        {r.status === "pending_review" && (
                          <span className="ml-auto whitespace-nowrap rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-inset ring-amber-400/25">
                            รอตรวจสอบ
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </Card>
              ))
            )}
          </div>
        )}
      </main>
    </>
  );
}
