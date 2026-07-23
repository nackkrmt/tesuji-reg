"use client";

import { useMemo, useState } from "react";
import { GoInstitute } from "@/lib/data/types";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { cn, formatThaiDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Combobox } from "@/components/ui/Combobox";
import { Sheet } from "@/components/ui/Sheet";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { TextInput } from "@/components/ui/form";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";

function instituteError(msg: string): string {
  if (msg.includes("DUPLICATE_NAME")) return "มีสถาบันชื่อนี้อยู่แล้ว";
  if (msg.includes("EMPTY_NAME")) return "กรุณากรอกชื่อสถาบัน";
  if (msg.includes("INSTITUTE_IN_USE"))
    return "ลบไม่ได้ — มีผู้สมัครใช้สถาบันนี้อยู่ ใช้ “ปิดใช้งาน” หรือ “รวม” แทน";
  if (msg.includes("SAME_INSTITUTE")) return "เลือกสถาบันเดียวกันไม่ได้";
  if (msg.includes("INSTITUTE_NOT_FOUND")) return "ไม่พบสถาบัน (อาจถูกลบไปแล้ว)";
  if (msg.includes("MERGE_NOT_FOUND")) return "ไม่พบประวัติการรวมนี้";
  if (msg.includes("ALREADY_REVERSED")) return "การรวมนี้ถูกแยกคืนไปแล้ว";
  if (msg.includes("UNAUTHORIZED")) return "ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)";
  return "ดำเนินการไม่สำเร็จ";
}

type SortKey = "name" | "name-desc" | "recent" | "keywords" | "applicants";
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "ชื่อ ก–ฮ" },
  { value: "name-desc", label: "ชื่อ ฮ–ก" },
  { value: "applicants", label: "ผู้สมัครมากสุด" },
  { value: "recent", label: "เพิ่มล่าสุด" },
  { value: "keywords", label: "คำค้นมากสุด" },
];

export default function AdminInstitutesPage() {
  const dl = useDataLayer();
  const toast = useToast();
  const { data: institutes, loading } = useLiveQuery(
    (d) => d.adminListInstitutes(),
    [],
    ["institutes"],
  );
  const { data: merges } = useLiveQuery(
    (d) => d.listInstituteMerges(),
    [],
    ["institutes"],
  );
  const { data: countMap } = useLiveQuery(
    (d) => d.instituteRegistrationCounts(),
    [],
    ["institutes", "registrations"],
  );
  const counts = useMemo(() => countMap ?? {}, [countMap]);

  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState<GoInstitute | null>(null);
  const [pendingMerge, setPendingMerge] = useState<{
    source: GoInstitute;
    target: GoInstitute;
  } | null>(null);
  const [merging, setMerging] = useState(false);
  const [lastMerge, setLastMerge] = useState<{
    mergeId: string;
    sourceName: string;
    targetName: string;
  } | null>(null);
  const [unmergingId, setUnmergingId] = useState<string | null>(null);

  const list = useMemo(() => institutes ?? [], [institutes]);
  const byId = useMemo(() => {
    const m: Record<string, GoInstitute> = {};
    list.forEach((i) => (m[i.id] = i));
    return m;
  }, [list]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) =>
        i.nameTh.toLowerCase().includes(q) ||
        i.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [list, query]);

  const sorted = useMemo(() => {
    const byName = (a: GoInstitute, b: GoInstitute) =>
      a.nameTh.localeCompare(b.nameTh, "th");
    const arr = [...filtered];
    switch (sort) {
      case "name-desc":
        arr.sort((a, b) => -byName(a, b));
        break;
      case "applicants":
        arr.sort(
          (a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || byName(a, b),
        );
        break;
      case "recent":
        arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        break;
      case "keywords":
        arr.sort((a, b) => b.keywords.length - a.keywords.length || byName(a, b));
        break;
      default:
        arr.sort(byName);
    }
    return arr;
  }, [filtered, sort, counts]);

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await dl.upsertInstitute({ nameTh: name });
      setNewName("");
      toast.show("เพิ่มสถาบันแล้ว", "success");
    } catch (e) {
      toast.show(instituteError((e as Error).message), "error");
    } finally {
      setBusy(false);
    }
  }

  function merge(source: GoInstitute, target: GoInstitute) {
    if (source.id === target.id) {
      toast.show("เลือกสถาบันเดียวกันไม่ได้", "error");
      return;
    }
    setPendingMerge({ source, target });
  }

  async function confirmMerge() {
    if (!pendingMerge) return;
    const { source, target } = pendingMerge;
    setMerging(true);
    try {
      const mergeId = await dl.mergeInstitute(source.id, target.id);
      setLastMerge({
        mergeId,
        sourceName: source.nameTh,
        targetName: target.nameTh,
      });
      toast.show(`รวมเข้ากับ “${target.nameTh}” แล้ว`, "success");
      setPendingMerge(null);
    } catch (e) {
      toast.show(instituteError((e as Error).message), "error");
    } finally {
      setMerging(false);
    }
  }

  async function unmerge(mergeId: string, sourceName: string) {
    if (unmergingId) return;
    setUnmergingId(mergeId);
    try {
      await dl.unmergeInstitute(mergeId);
      toast.show(`แยก “${sourceName}” คืนแล้ว`, "success");
      setLastMerge((lm) => (lm?.mergeId === mergeId ? null : lm));
    } catch (e) {
      toast.show(instituteError((e as Error).message), "error");
    } finally {
      setUnmergingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="สถาบันหมากล้อม"
        description={
          <>
            กด <span className="font-semibold text-white/70">+</span> ที่แต่ละสถาบันเพื่อจัดการ
            “คำค้น” (ชื่อเล่น/ชื่อครู ที่ผู้สมัครพิมพ์แล้วจะเจอสถาบันนี้) · รวมสถาบันที่ซ้ำกันได้
          </>
        }
      />

      {/* add new + search */}
      <Card className="space-y-2.5 p-4">
        <div className="flex gap-2">
          <TextInput
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="เพิ่มสถาบันใหม่…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          <Button onClick={add} loading={busy} className="shrink-0">
            เพิ่ม
          </Button>
        </div>
        {list.length > 8 && (
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาสถาบันหรือคำค้น…"
              className="pl-9"
            />
          </div>
        )}
      </Card>

      {/* undo banner for the most recent merge */}
      {lastMerge && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <span className="min-w-0 flex-1 text-sm text-amber-100">
            รวม “{lastMerge.sourceName}” เข้ากับ “{lastMerge.targetName}” แล้ว
          </span>
          <button
            type="button"
            onClick={() => unmerge(lastMerge.mergeId, lastMerge.sourceName)}
            disabled={unmergingId === lastMerge.mergeId}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-sm font-medium lg:py-1.5 text-sky-300 transition hover:bg-sky-500/10 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
            </svg>
            {unmergingId === lastMerge.mergeId ? "กำลังเลิกทำ…" : "เลิกทำ"}
          </button>
          <button
            type="button"
            onClick={() => setLastMerge(null)}
            disabled={unmergingId === lastMerge.mergeId}
            aria-label="ปิด"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 transition hover:bg-white/10 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* the institute list — flat rows, no per-item frame */}
      {loading ? (
        <CenterLoader label="กำลังโหลด…" />
      ) : list.length === 0 ? (
        <EmptyState title="ยังไม่มีสถาบัน" description="เพิ่มสถาบันแรกด้านบน" />
      ) : filtered.length === 0 ? (
        <EmptyState title="ไม่พบสถาบันที่ค้นหา" />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs text-white/40">
              {query.trim()
                ? `พบ ${filtered.length} จาก ${list.length} สถาบัน`
                : `${list.length} สถาบัน`}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-xs text-white/40">เรียง</span>
              <Combobox
                compact
                searchable={false}
                value={sort}
                onChange={(v) => setSort(v as SortKey)}
                options={SORT_OPTIONS}
                className="w-32"
                panelClassName="w-40"
              />
            </div>
          </div>
          <Card className="divide-y divide-white/[0.07] overflow-hidden p-0">
            {sorted.map((i) => (
              <InstituteRow
                key={i.id}
                institute={i}
                applicants={counts[i.id] ?? 0}
                expanded={expandedId === i.id}
                onToggle={() =>
                  setExpandedId((cur) => (cur === i.id ? null : i.id))
                }
                onStartMerge={() => setMergeSource(i)}
              />
            ))}
          </Card>
        </div>
      )}

      {/* permanent, reversible merge history */}
      {merges && merges.length > 0 && (
        <Card className="space-y-3 p-4">
          <div>
            <SectionTitle>ประวัติการรวมสถาบัน</SectionTitle>
            <p className="mt-1 text-xs text-white/40">
              บันทึกถาวร — กด “แยกคืน” เพื่อแยกการรวมกลับเป็นคนละสถาบันได้ทุกเมื่อ
            </p>
          </div>
          <div className="space-y-2">
            {merges.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white/85">
                    <span className="font-medium">{m.sourceName}</span>
                    <span className="px-1 text-white/40">→</span>
                    <span className="font-medium">{m.targetName}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-white/40">
                    {formatThaiDateTime(m.mergedAt)}
                    {m.movedCount > 0 && ` · ย้าย ${m.movedCount} รายการ`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => unmerge(m.id, m.sourceName)}
                  disabled={unmergingId === m.id}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-sm font-medium lg:py-1.5 text-sky-300 transition hover:bg-sky-500/10 disabled:opacity-50"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                  >
                    <path d="M9 14 4 9l5-5" />
                    <path d="M4 9h11a5 5 0 0 1 0 10h-1" />
                  </svg>
                  {unmergingId === m.id ? "กำลังแยก…" : "แยกคืน"}
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* "merge into…" target picker */}
      <Sheet
        open={!!mergeSource}
        onClose={() => setMergeSource(null)}
        title={`รวม “${mergeSource?.nameTh ?? ""}” เข้ากับ…`}
      >
        <p className="mb-3 text-sm text-white/55">
          เลือกสถาบันหลักที่จะรวมเข้าไป — “{mergeSource?.nameTh}” จะกลายเป็นคำค้นของสถาบันนั้น
          และผู้ที่สังกัดอยู่จะถูกย้ายตาม
        </p>
        <Combobox
          value={null}
          onChange={(targetId) => {
            const source = mergeSource;
            const target = byId[targetId];
            setMergeSource(null);
            if (source && target) void merge(source, target);
          }}
          options={list
            .filter((i) => i.id !== mergeSource?.id)
            .map((i) => ({ value: i.id, label: i.nameTh, keywords: i.keywords }))}
          placeholder="— เลือกสถาบันหลัก —"
          searchable
          searchPlaceholder="ค้นหาสถาบัน หรือ คำค้น…"
          emptyText="ไม่พบสถาบัน"
        />
      </Sheet>

      <ConfirmSheet
        open={!!pendingMerge}
        onClose={() => setPendingMerge(null)}
        onConfirm={confirmMerge}
        tone="primary"
        title="รวมสถาบัน"
        description={
          pendingMerge
            ? `รวม “${pendingMerge.source.nameTh}” เข้ากับ “${pendingMerge.target.nameTh}” ?`
            : undefined
        }
        confirmLabel="รวมสถาบัน"
        loading={merging}
      >
        {pendingMerge && (
          <ul className="space-y-1.5 text-sm text-white/60">
            <li>
              • ทุกคนที่สังกัด “{pendingMerge.source.nameTh}” จะย้ายไปสังกัด “
              {pendingMerge.target.nameTh}”
            </li>
            <li>
              • “{pendingMerge.source.nameTh}” จะกลายเป็นคำค้นของ “
              {pendingMerge.target.nameTh}” แล้วถูกลบ
            </li>
            <li className="text-white/40">(แยกคืนได้ภายหลังที่ “ประวัติการรวม”)</li>
          </ul>
        )}
      </ConfirmSheet>
    </div>
  );
}

function InstituteRow({
  institute,
  applicants,
  expanded,
  onToggle,
  onStartMerge,
}: {
  institute: GoInstitute;
  applicants: number;
  expanded: boolean;
  onToggle: () => void;
  onStartMerge: () => void;
}) {
  const dl = useDataLayer();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [newKw, setNewKw] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(institute.nameTh);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  /** Persist a new keyword list for this institute (keeps name + active). */
  async function setKeywords(keywords: string[]) {
    setBusy(true);
    try {
      await dl.upsertInstitute({
        id: institute.id,
        nameTh: institute.nameTh,
        active: institute.active,
        keywords,
      });
    } catch (e) {
      toast.show(instituteError((e as Error).message), "error");
    } finally {
      setBusy(false);
    }
  }

  async function addKeyword() {
    const k = newKw.trim();
    if (!k) return;
    setNewKw("");
    if (institute.keywords.includes(k)) return;
    await setKeywords([...institute.keywords, k]);
  }

  async function removeKeyword(k: string) {
    await setKeywords(institute.keywords.filter((x) => x !== k));
  }

  async function saveName() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await dl.upsertInstitute({
        id: institute.id,
        nameTh: n,
        active: institute.active,
      });
      setEditingName(false);
      toast.show("เปลี่ยนชื่อแล้ว", "success");
    } catch (e) {
      toast.show(instituteError((e as Error).message), "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    try {
      if (institute.active) {
        await dl.deleteInstitute(institute.id);
        toast.show("ปิดใช้งานแล้ว", "success");
      } else {
        await dl.upsertInstitute({
          id: institute.id,
          nameTh: institute.nameTh,
          active: true,
        });
        toast.show("เปิดใช้งานแล้ว", "success");
      }
    } catch (e) {
      toast.show(instituteError((e as Error).message), "error");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    setConfirmDeleteOpen(true);
  }

  async function doRemove() {
    setBusy(true);
    try {
      await dl.purgeInstitute(institute.id);
      toast.show("ลบสถาบันแล้ว", "success");
      setConfirmDeleteOpen(false);
    } catch (e) {
      toast.show(instituteError((e as Error).message), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn(!institute.active && "opacity-60")}>
      {/* collapsed header row */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "ย่อ" : "ขยาย"}
          aria-expanded={expanded}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/15 text-lg leading-none text-white/70 transition hover:bg-white/10 lg:h-7 lg:w-7"
        >
          {expanded ? "−" : "+"}
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
        >
          <span className="truncate font-medium text-white/90">
            {institute.nameTh}
          </span>
          <span className="shrink-0 text-xs text-white/35">
            {!institute.active
              ? "ปิดใช้งาน"
              : [
                  `${applicants} คน`,
                  institute.keywords.length > 0
                    ? `${institute.keywords.length} คำค้น`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </button>
      </div>

      {/* expanded panel */}
      {expanded && (
        <div className="space-y-3 px-3 pb-3.5 sm:pl-[3.4rem]">
          {/* rename */}
          {editingName ? (
            <div className="flex gap-2">
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-sm"
                autoFocus
              />
              <Button
                onClick={saveName}
                loading={busy}
                className="h-9 shrink-0 px-3 text-sm"
              >
                บันทึก
              </Button>
              <button
                type="button"
                onClick={() => {
                  setEditingName(false);
                  setName(institute.nameTh);
                }}
                className="shrink-0 rounded-lg px-2 py-1.5 text-sm text-white/55 hover:bg-white/10"
              >
                ยกเลิก
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setName(institute.nameTh);
                setEditingName(true);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-300 hover:text-brand-200"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              เปลี่ยนชื่อ
            </button>
          )}

          {/* keyword (alias) manager */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-white/45">
              คำค้น (ชื่อเล่น / ชื่ออื่นที่พิมพ์แล้วเจอสถาบันนี้)
            </p>
            {institute.keywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {institute.keywords.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] py-0.5 pl-2 pr-1 text-xs text-white/75 ring-1 ring-inset ring-white/10"
                  >
                    {k}
                    <button
                      type="button"
                      onClick={() => removeKeyword(k)}
                      disabled={busy}
                      aria-label={`ลบคำค้น ${k}`}
                      className="flex -my-1 h-7 w-7 items-center justify-center rounded text-white/40 transition hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-50"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3 w-3"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/30">ยังไม่มีคำค้น</p>
            )}
            <div className="mt-2 flex gap-2">
              <TextInput
                value={newKw}
                onChange={(e) => setNewKw(e.target.value)}
                placeholder="เพิ่มคำค้น เช่น ครูม่อน"
                className="h-9 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addKeyword();
                  }
                }}
              />
              <button
                type="button"
                onClick={addKeyword}
                disabled={busy || !newKw.trim()}
                className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-brand-600/80 px-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                เพิ่ม
              </button>
            </div>
          </div>

          {/* secondary actions */}
          <div className="flex flex-wrap gap-1 border-t border-white/10 pt-2.5">
            <button
              type="button"
              onClick={onStartMerge}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-sm font-medium lg:py-1.5 text-sky-300 transition hover:bg-sky-500/10 disabled:opacity-50"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <path d="m15 4 5 5-5 5" />
                <path d="M20 9H9a5 5 0 0 0 0 10h1" />
              </svg>
              รวมเข้ากับสถาบันอื่น
            </button>
            <button
              type="button"
              onClick={toggleActive}
              disabled={busy}
              className={cn(
                "rounded-lg px-2.5 py-2.5 text-sm font-medium lg:py-1.5 transition disabled:opacity-50",
                institute.active
                  ? "text-amber-300 hover:bg-amber-500/10"
                  : "text-emerald-300 hover:bg-emerald-500/10",
              )}
            >
              {institute.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="rounded-lg px-2.5 py-2.5 text-sm font-medium lg:py-1.5 text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
            >
              ลบ
            </button>
          </div>
        </div>
      )}

      <ConfirmSheet
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={doRemove}
        title="ลบสถาบันถาวร"
        description={`ลบสถาบัน “${institute.nameTh}” ออกถาวร? ถ้ามีผู้สมัครเลือกสถาบันนี้อยู่จะลบไม่ได้ — ใช้ “ปิดใช้งาน” หรือ “รวม” แทน`}
        confirmLabel="ลบถาวร"
        loading={busy}
      />
    </div>
  );
}
