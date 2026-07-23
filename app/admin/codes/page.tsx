"use client";

import { useMemo, useState } from "react";
import {
  PromoCode,
  PromoCodeInput,
  PromoKind,
  Tournament,
} from "@/lib/data/types";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { formatThaiDateTime, isoToLocalInput, localInputToIso } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Field, Select, TextInput, Toggle } from "@/components/ui/form";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { useToast } from "@/components/ui/Toast";

const KIND_LABEL: Record<PromoKind, string> = {
  free: "สมัครฟรี",
  percent: "ลดเป็นเปอร์เซ็นต์",
  fixed: "ลดเป็นจำนวนเงิน",
};

function promoError(msg: string): string {
  if (msg.includes("CODE_DUPLICATE")) return "มีโค้ดนี้ในรายการนี้อยู่แล้ว";
  if (msg.includes("CODE_REQUIRED")) return "กรุณากรอกโค้ด";
  if (msg.includes("KIND_INVALID")) return "ชนิดโค้ดไม่ถูกต้อง";
  if (msg.includes("TOURNAMENT_REQUIRED")) return "กรุณาเลือกรายการแข่งขัน";
  if (msg.includes("UNAUTHORIZED")) return "ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)";
  return "ดำเนินการไม่สำเร็จ";
}

type FormState = {
  id?: string;
  code: string;
  kind: PromoKind;
  value: string;
  maxUses: string;
  validUntil: string;
  active: boolean;
  note: string;
};

const emptyForm = (): FormState => ({
  code: "",
  kind: "free",
  value: "",
  maxUses: "",
  validUntil: "",
  active: true,
  note: "",
});

export default function AdminCodesPage() {
  const dl = useDataLayer();
  const toast = useToast();

  const { data: tournaments, loading: tLoading } = useLiveQuery(
    (d) => d.listTournaments(),
    [],
    ["tournament"],
  );
  const [tid, setTid] = useState<string | null>(null);
  const activeTid =
    tid ??
    (tournaments?.find((t) => t.status === "published")?.id ||
      tournaments?.[0]?.id ||
      null);

  const { data: promos, loading: pLoading } = useLiveQuery(
    (d) => (activeTid ? d.adminListPromos(activeTid) : Promise.resolve([])),
    [activeTid],
    ["promos"],
  );

  const [form, setForm] = useState<FormState>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PromoCode | null>(null);
  const [deleting, setDeleting] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const editing = !!form.id;

  function startEdit(p: PromoCode) {
    setForm({
      id: p.id,
      code: p.code,
      kind: p.kind,
      value: p.kind === "free" ? "" : String(p.value),
      maxUses: p.maxUses == null ? "" : String(p.maxUses),
      validUntil: p.validUntil ? isoToLocalInput(p.validUntil) : "",
      active: p.active,
      note: p.note ?? "",
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSave() {
    if (!activeTid) {
      toast.show("ยังไม่มีรายการแข่งขัน", "error");
      return;
    }
    const code = form.code.trim();
    if (!code) {
      toast.show("กรุณากรอกโค้ด", "error");
      return;
    }
    if (form.kind === "percent") {
      const v = Number(form.value);
      if (!(v > 0 && v <= 100)) {
        toast.show("เปอร์เซ็นต์ต้องอยู่ระหว่าง 1–100", "error");
        return;
      }
    }
    if (form.kind === "fixed" && !(Number(form.value) > 0)) {
      toast.show("จำนวนเงินที่ลดต้องมากกว่า 0", "error");
      return;
    }
    const payload: PromoCodeInput = {
      id: form.id,
      tournamentId: activeTid,
      code,
      kind: form.kind,
      value: form.kind === "free" ? 0 : Number(form.value) || 0,
      maxUses: form.maxUses.trim() ? Number(form.maxUses) : null,
      validUntil: form.validUntil ? localInputToIso(form.validUntil) : null,
      active: form.active,
      note: form.note.trim() || null,
    };
    setBusy(true);
    try {
      await dl.adminUpsertPromo(payload);
      toast.show(editing ? "บันทึกโค้ดแล้ว" : "สร้างโค้ดแล้ว", "success");
      setForm(emptyForm());
    } catch (e) {
      toast.show(promoError((e as Error).message), "error");
    } finally {
      setBusy(false);
    }
  }

  function onDelete(p: PromoCode) {
    setDeleteTarget(p);
  }

  async function confirmDelete() {
    const p = deleteTarget;
    if (!p) return;
    setDeleting(true);
    try {
      await dl.adminDeletePromo(p.id);
      toast.show("ลบโค้ดแล้ว", "success");
      if (form.id === p.id) setForm(emptyForm());
      setDeleteTarget(null);
    } catch (e) {
      toast.show(promoError((e as Error).message), "error");
    } finally {
      setDeleting(false);
    }
  }

  async function toggleActive(p: PromoCode) {
    try {
      await dl.adminUpsertPromo({
        id: p.id,
        tournamentId: p.tournamentId,
        code: p.code,
        kind: p.kind,
        value: p.value,
        maxUses: p.maxUses,
        validUntil: p.validUntil,
        active: !p.active,
        note: p.note,
      });
    } catch (e) {
      toast.show(promoError((e as Error).message), "error");
    }
  }

  const list = promos ?? [];

  if (tLoading) return <CenterLoader label="กำลังโหลด…" />;
  if (!tournaments || tournaments.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีรายการแข่งขัน"
        description="สร้างรายการแข่งขันก่อน แล้วค่อยตั้งโค้ดส่วนลด/สมัครฟรี"
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="โค้ดส่วนลด"
        description="สร้างและจัดการโค้ดส่วนลดค่าสมัคร"
      />

      {tournaments.length > 1 && (
        <Field label="รายการแข่งขัน">
          <Select value={activeTid ?? ""} onChange={(e) => setTid(e.target.value)}>
            {tournaments.map((t: Tournament) => (
              <option key={t.id} value={t.id}>
                {t.nameTh}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {/* create / edit form */}
      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <SectionTitle>
            {editing ? "แก้ไขโค้ด" : "สร้างโค้ดใหม่"}
          </SectionTitle>
          {editing && (
            <button
              type="button"
              onClick={() => setForm(emptyForm())}
              className="text-sm font-medium text-white/50 hover:text-white/80"
            >
              + สร้างใหม่แทน
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="โค้ด" required hint="ผู้สมัครพิมพ์โค้ดนี้ (ไม่สนตัวพิมพ์เล็ก/ใหญ่)">
            <TextInput
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              placeholder="เช่น FREE2026"
              className="font-mono tracking-wide"
            />
          </Field>

          <Field label="โค้ดนี้ทำอะไร" required>
            <Select
              value={form.kind}
              onChange={(e) => set("kind", e.target.value as PromoKind)}
            >
              <option value="free">สมัครฟรี (ลดทั้งหมด)</option>
              <option value="percent">ลดเป็นเปอร์เซ็นต์</option>
              <option value="fixed">ลดเป็นจำนวนเงิน</option>
            </Select>
          </Field>

          {form.kind !== "free" && (
            <Field
              label={form.kind === "percent" ? "ลดกี่ %" : "ลดกี่บาท"}
              required
            >
              <TextInput
                type="number"
                inputMode="numeric"
                value={form.value}
                onChange={(e) => set("value", e.target.value)}
                placeholder={form.kind === "percent" ? "เช่น 50" : "เช่น 200"}
              />
            </Field>
          )}

          <Field label="ใช้ได้กี่ครั้ง" hint="เว้นว่าง = ไม่จำกัด">
            <TextInput
              type="number"
              inputMode="numeric"
              value={form.maxUses}
              onChange={(e) => set("maxUses", e.target.value)}
              placeholder="ไม่จำกัด"
            />
          </Field>

          <Field label="หมดอายุ" hint="เว้นว่าง = ไม่มีวันหมดอายุ">
            <TextInput
              type="datetime-local"
              value={form.validUntil}
              onChange={(e) => set("validUntil", e.target.value)}
            />
          </Field>

          <Field label="หมายเหตุ (ภายใน)">
            <TextInput
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
              placeholder="เช่น โค้ดสำหรับสตาฟ"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-4 pt-1">
          <Toggle checked={form.active} onChange={(v) => set("active", v)} label="เปิดใช้งาน" />
          <Button onClick={onSave} loading={busy} className="px-6">
            {editing ? "บันทึก" : "สร้างโค้ด"}
          </Button>
        </div>
      </Card>

      {/* list */}
      <div>
        <SectionTitle className="mb-2.5">
          โค้ดทั้งหมด{list.length > 0 ? ` (${list.length})` : ""}
        </SectionTitle>
        {pLoading ? (
          <CenterLoader label="กำลังโหลด…" />
        ) : list.length === 0 ? (
          <EmptyState title="ยังไม่มีโค้ด" description="สร้างโค้ดแรกจากฟอร์มด้านบน" />
        ) : (
          <div className="space-y-2.5">
            {list.map((p) => (
              <PromoRow
                key={p.id}
                p={p}
                onEdit={() => startEdit(p)}
                onDelete={() => onDelete(p)}
                onToggle={() => toggleActive(p)}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmSheet
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="ลบโค้ดส่วนลด"
        description={deleteTarget ? `ลบโค้ด "${deleteTarget.code}" ?` : undefined}
        confirmLabel="ลบโค้ด"
        loading={deleting}
      >
        {deleteTarget && deleteTarget.usedCount > 0 && (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
            โค้ดนี้ถูกใช้ไปแล้ว {deleteTarget.usedCount} ครั้ง
          </div>
        )}
      </ConfirmSheet>
    </div>
  );
}

function PromoRow({
  p,
  onEdit,
  onDelete,
  onToggle,
}: {
  p: PromoCode;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const expired = p.validUntil != null && Date.now() > Date.parse(p.validUntil);
  const exhausted = p.maxUses != null && p.usedCount >= p.maxUses;
  const live = p.active && !expired && !exhausted;

  const valueLabel = useMemo(() => {
    if (p.kind === "free") return "สมัครฟรี";
    if (p.kind === "percent") return `ลด ${p.value}%`;
    return `ลด ${p.value} บาท`;
  }, [p.kind, p.value]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-brand-500/20 px-2 py-0.5 font-mono text-sm font-bold tracking-wide text-brand-200 ring-1 ring-inset ring-brand-400/25">
              {p.code}
            </span>
            <span
              className={
                "rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset " +
                (live
                  ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/25"
                  : "bg-white/10 text-white/50 ring-white/15")
              }
            >
              {live ? "ใช้งานได้" : expired ? "หมดอายุ" : exhausted ? "ใช้ครบแล้ว" : "ปิดอยู่"}
            </span>
          </div>
          <p className="mt-1.5 text-sm font-medium text-white/85">
            {valueLabel}
            {p.kind !== "free" && (
              <span className="text-white/40">{` · ${KIND_LABEL[p.kind]}`}</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-white/45">
            ใช้แล้ว {p.usedCount}
            {p.maxUses != null ? ` / ${p.maxUses}` : " ครั้ง (ไม่จำกัด)"}
            {p.validUntil ? ` · หมดอายุ ${formatThaiDateTime(p.validUntil)}` : ""}
          </p>
          {p.note && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/35">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />
              </svg>
              {p.note}
            </p>
          )}
        </div>
        <Toggle checked={p.active} onChange={onToggle} />
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="h-9 flex-1 text-sm" onClick={onEdit}>
          แก้ไข
        </Button>
        <Button variant="ghost" className="h-9 px-3 text-sm text-rose-300" onClick={onDelete}>
          ลบ
        </Button>
      </div>
    </div>
  );
}
