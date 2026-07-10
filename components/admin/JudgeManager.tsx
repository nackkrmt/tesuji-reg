"use client";

import { ReactNode, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/PageHeader";
import { Field, Select, TextInput } from "@/components/ui/form";
import { CenterLoader, EmptyState, ErrorState, Pill } from "@/components/ui/feedback";
import { RowAction } from "@/components/ui/RowAction";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";
import { getAdminSecret } from "@/lib/admin-auth";
import { listDivisions, listJudges, setJudgeRole } from "@/lib/live/client";
import type { JudgeInfo, LiveDivision } from "@/lib/live/types";

/** Judge role management (/admin/judges): promote an existing account to judge,
 *  set each judge's default division, and revoke with a confirm step. Judges can
 *  only be promoted — accounts are never created here (ACCOUNT_NOT_FOUND means
 *  the person must sign up first). */
export function JudgeManager() {
  const toast = useToast();
  const [judges, setJudges] = useState<JudgeInfo[]>([]);
  const [divisions, setDivisions] = useState<LiveDivision[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [email, setEmail] = useState("");
  const [newDivisionId, setNewDivisionId] = useState("");
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState<JudgeInfo | null>(null);
  const [editDivisionId, setEditDivisionId] = useState("");
  const [revoking, setRevoking] = useState<JudgeInfo | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const [js, divs] = await Promise.all([
        listJudges(getAdminSecret()),
        listDivisions(),
      ]);
      setJudges(js);
      setDivisions(divs);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const divisionName = (id: string | null) =>
    id ? (divisions.find((d) => d.id === id)?.name ?? id) : null;

  async function addJudge() {
    const trimmed = email.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await setJudgeRole(getAdminSecret(), trimmed, true, newDivisionId || null);
      toast.show("ตั้งเป็นกรรมการแล้ว", "success");
      setEmail("");
      setNewDivisionId("");
      await load();
    } catch (e) {
      const msg = (e as Error).message.includes("ACCOUNT_NOT_FOUND")
        ? "ไม่พบบัญชีนี้ในระบบ — ให้สมัครสมาชิกก่อน"
        : (e as Error).message.includes("UNAUTHORIZED")
          ? "ไม่มีสิทธิ์ (เข้าสู่ระบบ admin ใหม่)"
          : "ตั้งเป็นกรรมการไม่สำเร็จ";
      toast.show(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(j: JudgeInfo) {
    setEditing(j);
    setEditDivisionId(j.defaultDivisionId ?? "");
  }

  async function saveEdit() {
    if (!editing || saving) return;
    setSaving(true);
    try {
      await setJudgeRole(getAdminSecret(), editing.email, true, editDivisionId || null);
      toast.show("บันทึกรุ่นเริ่มต้นแล้ว", "success");
      setEditing(null);
      await load();
    } catch {
      toast.show("อัปเดตรุ่นไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRevoke() {
    if (!revoking || saving) return;
    setSaving(true);
    try {
      await setJudgeRole(getAdminSecret(), revoking.email, false);
      toast.show("ถอดสิทธิ์กรรมการแล้ว", "success");
      setRevoking(null);
      await load();
    } catch {
      toast.show("ถอดสิทธิ์ไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  }

  const assignedCount = judges.filter((j) => j.defaultDivisionId).length;
  // While the lists are loading (or failed), a literal 0 would read as "no
  // judges" — show a dash until real numbers exist.
  const statValue = (n: number) => (loading || loadError ? "–" : n);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Stat tone="brand" icon={<StatIcon d={ICON.users} />} label="กรรมการทั้งหมด" value={statValue(judges.length)} />
        <Stat tone="emerald" icon={<StatIcon d={ICON.userCheck} />} label="กำหนดรุ่นแล้ว" value={statValue(assignedCount)} />
        <Stat tone="sky" icon={<StatIcon d={ICON.layers} />} label="รุ่นแข่ง" value={statValue(divisions.length)} />
      </div>

      {/* Add judge */}
      <section>
        <SectionTitle className="mb-2">เพิ่มกรรมการ</SectionTitle>
        <Card className="p-4 sm:p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addJudge();
            }}
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,15rem)_auto] sm:items-end"
          >
            <Field label="อีเมลกรรมการ" htmlFor="judge-email">
              <TextInput
                id="judge-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="off"
              />
            </Field>
            <Field label="รุ่นเริ่มต้น" htmlFor="judge-division">
              <Select
                id="judge-division"
                value={newDivisionId}
                onChange={(e) => setNewDivisionId(e.target.value)}
              >
                <option value="">ไม่กำหนด</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={busy} disabled={!email.trim()}>
              ตั้งเป็นกรรมการ
            </Button>
          </form>
          <p className="mt-3 text-xs text-white/40">
            กรรมการต้องมีบัญชีในระบบก่อน — หากไม่พบอีเมล ให้สมัครสมาชิกก่อนแล้วลองอีกครั้ง
          </p>
        </Card>
      </section>

      {/* Current judges */}
      <section>
        <SectionTitle className="mb-2">กรรมการปัจจุบัน ({judges.length})</SectionTitle>
        {loading ? (
          <CenterLoader label="กำลังโหลด…" />
        ) : loadError ? (
          <ErrorState onRetry={load} />
        ) : judges.length === 0 ? (
          <EmptyState
            title="ยังไม่มีกรรมการ"
            description="เพิ่มกรรมการคนแรกได้จากฟอร์มด้านบน"
          />
        ) : (
          <Card className="divide-y divide-white/[0.07] p-0">
            {judges.map((j) => (
              <JudgeRow
                key={j.accountId}
                judge={j}
                divisionName={divisionName(j.defaultDivisionId)}
                onEdit={() => openEdit(j)}
                onRevoke={() => setRevoking(j)}
              />
            ))}
          </Card>
        )}
      </section>

      {/* Edit default division */}
      <Sheet
        open={!!editing}
        onClose={() => {
          if (!saving) setEditing(null);
        }}
        title="แก้ไขกรรมการ"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button fullWidth onClick={saveEdit} loading={saving}>
              บันทึก
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="space-y-4">
            <JudgeInfoBox judge={editing} />
            <Field
              label="รุ่นเริ่มต้น"
              htmlFor="edit-judge-division"
              hint="รุ่นที่เปิดให้อัตโนมัติเมื่อกรรมการเข้าหน้ากรอกผล"
            >
              <Select
                id="edit-judge-division"
                value={editDivisionId}
                onChange={(e) => setEditDivisionId(e.target.value)}
              >
                <option value="">ไม่กำหนด</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </Sheet>

      {/* Revoke confirm */}
      <Sheet
        open={!!revoking}
        onClose={() => {
          if (!saving) setRevoking(null);
        }}
        title="ถอดสิทธิ์กรรมการ"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setRevoking(null)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="danger" fullWidth onClick={confirmRevoke} loading={saving}>
              ถอดสิทธิ์
            </Button>
          </div>
        }
      >
        {revoking && (
          <div className="space-y-4">
            <JudgeInfoBox judge={revoking} />
            <p className="text-sm leading-relaxed text-white/60">
              บัญชีนี้จะกรอกผลแข่งไม่ได้จนกว่าจะตั้งเป็นกรรมการอีกครั้ง
            </p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────

function JudgeRow({
  judge,
  divisionName,
  onEdit,
  onRevoke,
}: {
  judge: JudgeInfo;
  divisionName: string | null;
  onEdit: () => void;
  onRevoke: () => void;
}) {
  const display = judge.firstNameTh || judge.email;
  return (
    <div className="px-4 py-3 sm:flex sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-200 ring-1 ring-inset ring-brand-400/25">
          {display.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white/90">{display}</p>
          <p className="truncate text-xs text-white/45">{judge.email}</p>
        </div>
      </div>
      {/* pl-[52px] = avatar 40px + gap 12px so the mobile second line aligns
          under the text column */}
      <div className="mt-2 flex items-center justify-between gap-2 pl-[52px] sm:mt-0 sm:justify-end sm:pl-0">
        <Pill tone={judge.defaultDivisionId ? "good" : "neutral"} size="sm">
          {divisionName ?? "ไม่กำหนดรุ่น"}
        </Pill>
        <div className="flex shrink-0 gap-1">
          <RowAction tone="brand" onClick={onEdit}>
            แก้ไข
          </RowAction>
          <RowAction tone="danger" onClick={onRevoke}>
            ถอดสิทธิ์
          </RowAction>
        </div>
      </div>
    </div>
  );
}

function JudgeInfoBox({ judge }: { judge: JudgeInfo }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="font-semibold text-white/90">{judge.firstNameTh || judge.email}</p>
      <p className="mt-0.5 text-xs text-white/45">{judge.email}</p>
    </div>
  );
}

const statTone = {
  brand: { tile: "bg-brand-500/15 text-brand-300 ring-brand-400/25", num: "text-brand-200" },
  emerald: { tile: "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25", num: "text-emerald-300" },
  sky: { tile: "bg-sky-400/15 text-sky-300 ring-sky-400/25", num: "text-sky-300" },
} as const;

function Stat({
  tone,
  icon,
  label,
  value,
}: {
  tone: keyof typeof statTone;
  icon: ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="p-3.5 sm:p-4">
      <div
        className={cn(
          "mb-3 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset",
          statTone[tone].tile,
        )}
      >
        {icon}
      </div>
      <p className={cn("text-2xl font-bold sm:text-3xl", statTone[tone].num)}>{value}</p>
      <p className="mt-1 text-[11px] text-white/55 sm:text-xs">{label}</p>
    </Card>
  );
}

function StatIcon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICON = {
  users:
    "M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6z",
  userCheck:
    "M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6zM15 10l2 2 4-4",
  layers: "M12 3l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4",
} as const;
