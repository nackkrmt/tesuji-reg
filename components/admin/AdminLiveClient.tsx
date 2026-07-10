"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/form";
import { CenterLoader, Pill } from "@/components/ui/feedback";
import { RowAction } from "@/components/ui/RowAction";
import { useToast } from "@/components/ui/Toast";
import { getAdminSecret } from "@/lib/admin-auth";
import { useLive } from "@/lib/live/useLive";
import { isResultDecided, roundsOf } from "@/lib/live/types";
import { getToken } from "@/lib/live/client";
import type { LiveDivision, LiveMatch } from "@/lib/live/types";

export function AdminLiveClient() {
  const { divisions, matches, loading } = useLive();
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    getToken(getAdminSecret())
      .then(setToken)
      .catch(() => setToken(null));
  }, []);

  const decided = matches.filter((m) => isResultDecided(m.result)).length;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show(`คัดลอก${label}แล้ว`, "success");
    } catch {
      toast.show("คัดลอกไม่สำเร็จ", "error");
    }
  }

  if (loading) return <CenterLoader label="กำลังโหลด…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="ผลแข่งสด"
        description="อัปโหลดผลจับคู่จาก MacMahon และติดตามผลการแข่งขัน"
        action={
          <Link
            href="/admin/judges"
            className="text-xs font-semibold text-brand-300 hover:text-brand-200"
          >
            จัดการกรรมการ →
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="รุ่นแข่ง" value={divisions.length} />
        <Stat label="คู่แข่งทั้งหมด" value={matches.length} />
        <Stat label="บันทึกผลแล้ว" value={decided} />
      </div>

      {/* Round completion + live toast on transition */}
      <RoundCompletionNotices divisions={divisions} matches={matches} />

      {/* Match schedule + who submitted each result */}
      <section>
        <SectionTitle className="mb-2">ตารางการแข่ง</SectionTitle>
        <MatchScheduleTable divisions={divisions} matches={matches} />
      </section>

      {/* MacMahon config */}
      <section>
        <SectionTitle className="mb-2">
          ตั้งค่าโปรแกรม MacMahon (launcher.properties)
        </SectionTitle>
        <Card className="space-y-2.5 p-4">
          <p className="text-xs text-white/55">
            ใส่ค่าสองบรรทัดนี้ในไฟล์ launcher.properties เพื่อให้ MacMahon ส่งคู่จับ/ผลเข้าระบบ
          </p>
          <ConfigRow label="tesuji.url" value={origin} onCopy={copy} />
          <ConfigRow label="tesuji.token" value={token ?? "…"} onCopy={copy} />
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-white/55">{label}</p>
    </Card>
  );
}

function ConfigRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: (text: string, label: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 font-mono text-xs text-white/45">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded-lg bg-white/[0.06] px-2.5 py-2 text-xs text-white/80">
        {value}
      </code>
      <RowAction tone="brand" onClick={() => onCopy(value, label)} className="shrink-0">
        คัดลอก
      </RowAction>
    </div>
  );
}

interface RoundStatus {
  division: LiveDivision;
  round: string | null;
  decided: number;
  total: number;
}

/** Current (= highest-numbered) round per division, with how many of its
 *  tables have a decided result. A division with no matches yet has no round. */
function currentRoundStatuses(divisions: LiveDivision[], matches: LiveMatch[]): RoundStatus[] {
  return divisions.map((d) => {
    const divMatches = matches.filter((m) => m.divisionId === d.id);
    const round = roundsOf(divMatches)[0] ?? null;
    if (!round) return { division: d, round: null, decided: 0, total: 0 };
    const roundMatches = divMatches.filter((m) => m.round === round);
    const decided = roundMatches.filter((m) => isResultDecided(m.result)).length;
    return { division: d, round, decided, total: roundMatches.length };
  });
}

/** Banner listing each division's current-round progress, + a one-time toast
 *  the moment a round transitions from incomplete to fully submitted. "ครบ"
 *  here means the current round only — the system has no fixed round count
 *  per division (MacMahon uploads one round at a time), so there's no way to
 *  know when a division's whole tournament is "done". */
function RoundCompletionNotices({
  divisions,
  matches,
}: {
  divisions: LiveDivision[];
  matches: LiveMatch[];
}) {
  const toast = useToast();
  const notifiedRef = useRef<Set<string> | null>(null);
  const statuses = currentRoundStatuses(divisions, matches);

  useEffect(() => {
    if (notifiedRef.current === null) {
      // First load: remember rounds that are already complete, but don't toast
      // for them — only new completions during this session should notify.
      notifiedRef.current = new Set(
        statuses
          .filter((s) => s.round && s.total > 0 && s.decided === s.total)
          .map((s) => `${s.division.id}|${s.round}`),
      );
      return;
    }
    for (const s of statuses) {
      if (!s.round || s.total === 0) continue;
      const key = `${s.division.id}|${s.round}`;
      const complete = s.decided === s.total;
      if (complete && !notifiedRef.current.has(key)) {
        notifiedRef.current.add(key);
        toast.show(`${s.division.name} รอบ ${s.round} ผลครบแล้ว! (${s.total}/${s.total})`, "success");
      } else if (!complete) {
        notifiedRef.current.delete(key); // allow re-notify if a result gets reverted later
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions, matches, toast]);

  const withRounds = statuses.filter((s) => s.round);
  if (withRounds.length === 0) return null;

  return (
    <section>
      <SectionTitle className="mb-2">สถานะรอบปัจจุบัน</SectionTitle>
      <Card className="divide-y divide-white/[0.07] p-0">
        {withRounds.map((s) => {
          const complete = s.total > 0 && s.decided === s.total;
          return (
            <div key={s.division.id} className="flex items-center gap-3 px-4 py-2.5">
              <Pill tone={complete ? "good" : "warn"} size="sm">
                {complete ? "ครบ" : "รอผล"}
              </Pill>
              <p className="min-w-0 flex-1 truncate text-sm text-white/85">
                {s.division.name} — รอบ {s.round}
              </p>
              <span className="shrink-0 text-xs text-white/45">
                {s.decided}/{s.total} โต๊ะ{complete ? " · ครบแล้ว" : ""}
              </span>
            </div>
          );
        })}
      </Card>
    </section>
  );
}

function MatchScheduleTable({
  divisions,
  matches,
}: {
  divisions: LiveDivision[];
  matches: LiveMatch[];
}) {
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [round, setRound] = useState("");

  useEffect(() => {
    if (!divisionId && divisions[0]) setDivisionId(divisions[0].id);
  }, [divisions, divisionId]);

  const divMatches = matches.filter((m) => m.divisionId === divisionId);
  const rounds = roundsOf(divMatches);
  const activeRound = round || rounds[0] || "";
  const rows = divMatches
    .filter((m) => m.round === activeRound)
    .sort((a, b) => {
      const na = parseFloat(a.table);
      const nb = parseFloat(b.table);
      return Number.isNaN(na) || Number.isNaN(nb) ? a.table.localeCompare(b.table) : na - nb;
    });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select
          value={divisionId}
          onChange={(e) => {
            setDivisionId(e.target.value);
            setRound("");
          }}
          className="sm:w-56"
        >
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select value={activeRound} onChange={(e) => setRound(e.target.value)} className="sm:w-32">
          {rounds.map((r) => (
            <option key={r} value={r}>
              รอบ {r}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.07] text-xs uppercase tracking-wider text-white/45">
              <th className="px-2 py-2 font-medium">โต๊ะ</th>
              <th className="px-2 py-2 font-medium">ชื่อ</th>
              <th className="px-2 py-2 text-center font-medium">ผล</th>
              <th className="px-2 py-2 font-medium">ชื่อ</th>
              <th className="px-2 py-2 font-medium">ส่งผลโดย</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.07]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-xs text-white/40">
                  ไม่มีคู่แข่งในรอบนี้
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.id} className="text-white/85">
                  <td className="px-2 py-2 text-white/60">{m.table}</td>
                  <td className="px-2 py-2">{m.black}</td>
                  <td className="px-2 py-2 text-center text-white/60">{m.result}</td>
                  <td className="px-2 py-2">{m.white}</td>
                  <td className="px-2 py-2 text-white/60">{m.submittedBy || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
