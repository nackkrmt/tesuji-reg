"use client";

// /admin/awards — นำเข้าผลจากไฟล์ MacMahon .xml เข้าฐานข้อมูลรางวัล (AWARD).
// อัปโหลดไฟล์ (ไฟล์ละรุ่น) → ระบบคำนวณอันดับ (ชนะ → SOS → SOSOS) → เลือก top-N
// ให้ก่อน → admin ตรวจ/แก้ทุกช่อง → บันทึกเข้า go_player_database (append แบบ
// idempotent ต่อรายการ+รุ่น) → ดาวน์โหลด .xlsx โครงเดียวกับ master sheet ไปวางต่อ
// (master sheet ยังเป็นแหล่งข้อมูลหลัก — sync ทั้งชุดจะแทนที่ฐาน award ทั้งหมด
// เหมือนเดิม จึงต้องเอาแถวที่บันทึกที่นี่ไปเติมใน sheet ด้วยเสมอ)

import { useEffect, useMemo, useRef, useState } from "react";
import { GoPlayerImportRow, TITLE_PREFIXES } from "@/lib/data/types";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { useAdminTournament } from "@/components/admin/AdminTournamentContext";
import {
  divisionLabel,
  parseMacmahonXml,
  splitThaiFullName,
  type ParsedDivision,
  type StandingRow,
} from "@/lib/macmahon-xml";
import { awardKyu, normalizeThaiName } from "@/lib/go-database";
import { buildAwardSheetXlsx, type AwardSheetRow } from "@/lib/award-sheet";
import { download, stampNow } from "@/lib/download";
import { Card, SectionTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { Field, Select, TextInput } from "@/components/ui/form";
import { RowAction } from "@/components/ui/RowAction";
import { Pill, Spinner } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";

const MAX_PLACES = 10;
const NO_TOURNAMENT = "";

const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** event_date is free text and the whole existing award corpus writes it the
 *  master sheet's way — "Aug 9, 2026", or "Feb 21-22, 2026" for a two-day
 *  event. Prefill a tournament's ISO competitionDate into that shape; anything
 *  already free text (legacy rows, ranges) passes through untouched so the
 *  admin can keep or edit it. Matching the corpus matters: event_date is half
 *  the key the 1-kyu award ceiling counts events by, and half the key this
 *  page replaces its own rows by on re-import. */
function toSheetDate(value: string): string {
  const v = value.trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!iso) return v;
  const month = MONTHS_EN[Number(iso[2]) - 1];
  return month ? `${month} ${Number(iso[3])}, ${iso[1]}` : v;
}

interface SeatMatch {
  firstName: string;
  lastName: string;
  prefix: string;
}

interface WinnerRow {
  /** stable key inside the division card */
  key: string;
  place: number; // rank_award
  prefix: string;
  firstName: string;
  lastName: string;
  seatMatched: boolean;
  /** ผู้ใช้แก้เองแล้ว — อย่าให้ seat-matching เขียนทับ */
  dirty: boolean;
  splitAmbiguous: boolean;
}

interface DivisionState {
  parsed: ParsedDivision;
  /** rank_in_category — สิ่งที่ awardKyu ใช้แปลงเป็น rank/power */
  label: string;
  /** คอลัมน์ category (ชื่อรุ่นเต็มบน sheet) */
  categoryLabel: string;
  places: number;
  winners: WinnerRow[];
  showAll: boolean;
}

/** เลขขั้นตอนหน้าหัวข้อ — ทำให้ลำดับงาน (ไฟล์ → ข้อมูลงาน → ตรวจรายรุ่น) อ่านออกทันที */
function StepBadge({ n }: { n: number }) {
  return (
    <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/20 text-[11px] font-bold text-brand-300 ring-1 ring-inset ring-brand-400/30">
      {n}
    </span>
  );
}

/** แถวที่เลือกเป็นผู้ได้รางวัลได้ — ตัดผู้เล่นตัวแทนบายทิ้ง
 *  หมายเหตุ: อันดับรางวัล (rank_award) นับจากลิสต์นี้ ไม่ใช่เลขอันดับดิบใน
 *  ตาราง — ไฮไลต์/เครื่องหมายเสมอในตารางจึงต้องคิดจากลิสต์นี้ด้วย */
function awardable(d: ParsedDivision) {
  return d.standings.filter((r) => !r.placeholder);
}

const scoreKey = (r: StandingRow) => `${r.points}|${r.sos}|${r.sosos}`;

/** คู่ที่คะแนนเท่ากันทุกตัวตัดสิน (ในหมู่ผู้เล่นจริง) + มีผลถึงช่วงรางวัลไหม */
function divisionTies(d: DivisionState): {
  tiedIds: Set<number>;
  boundaryTie: boolean;
} {
  const rows = awardable(d.parsed);
  const tiedIds = new Set<number>();
  for (let i = 0; i + 1 < rows.length; i++) {
    if (scoreKey(rows[i]) === scoreKey(rows[i + 1])) {
      tiedIds.add(rows[i].playerId);
      tiedIds.add(rows[i + 1].playerId);
    }
  }
  const boundaryTie = rows
    .slice(0, Math.min(d.places + 1, rows.length))
    .some((r) => tiedIds.has(r.playerId));
  return { tiedIds, boundaryTie };
}

function makeWinner(
  d: ParsedDivision,
  index: number,
  seatMap: Map<string, SeatMatch>,
): WinnerRow {
  const row = awardable(d)[index];
  const key = `${d.fileName}#${row ? row.playerId : `extra-${index}`}`;
  if (!row) {
    return {
      key,
      place: index + 1,
      prefix: "",
      firstName: "",
      lastName: "",
      seatMatched: false,
      dirty: false,
      splitAmbiguous: false,
    };
  }
  const match = seatMap.get(normalizeThaiName(row.fullName));
  const split = splitThaiFullName(row.fullName);
  return {
    key,
    place: index + 1,
    prefix: match?.prefix ?? "",
    firstName: match?.firstName ?? split.firstName,
    lastName: match?.lastName ?? split.lastName,
    seatMatched: !!match,
    dirty: false,
    splitAmbiguous: !match && split.ambiguous,
  };
}

function makeDivision(
  parsed: ParsedDivision,
  places: number,
  seatMap: Map<string, SeatMatch>,
): DivisionState {
  const label = divisionLabel(parsed.divisionName);
  const n = Math.min(places, awardable(parsed).length);
  return {
    parsed,
    label,
    categoryLabel: label,
    places: n,
    winners: Array.from({ length: n }, (_, i) => makeWinner(parsed, i, seatMap)),
    showAll: false,
  };
}

export default function AdminAwardsPage() {
  const dl = useDataLayer();
  const toast = useToast();
  const { tournament: activeTournament } = useAdminTournament();

  const [divisions, setDivisions] = useState<DivisionState[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [tid, setTid] = useState<string>(NO_TOURNAMENT);
  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [defaultPlaces, setDefaultPlaces] = useState(3);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();
  const [resultError, setResultError] = useState(false);
  const [savedRows, setSavedRows] = useState<AwardSheetRow[]>([]);
  const [dragging, setDragging] = useState(false);

  const { data: tournaments } = useLiveQuery((d) => d.listTournaments(), []);
  const { data: categories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
  );
  const { data: regs } = useLiveQuery(
    (d) => (tid ? d.listRegistrations(tid, "all") : Promise.resolve([])),
    [tid],
  );

  // ค่าเริ่มต้น = ทัวร์นาเมนต์ที่กำลังทำงานอยู่ใน admin (เปลี่ยน/ล้างได้)
  // activeTournament มาช้า (async) — seed แบบไม่ทับค่าที่ผู้ใช้เลือก/พิมพ์ไปแล้ว
  const seededTid = useRef(false);
  const userTouchedTournament = useRef(false);
  useEffect(() => {
    if (seededTid.current || !activeTournament) return;
    seededTid.current = true;
    if (userTouchedTournament.current) return;
    setTid((prev) => (prev === NO_TOURNAMENT ? activeTournament.id : prev));
    setEventName((prev) => prev || activeTournament.nameTh);
    setEventDate((prev) => prev || toSheetDate(activeTournament.competitionDate));
  }, [activeTournament]);

  // normalize(ชื่อเต็มจากใบสมัคร) → คำนำหน้า + การแยกชื่อ-นามสกุลที่ถูกต้อง
  // รวมทุกสถานะ (แม้ถอนตัว) — ใช้เพื่อกู้การสะกด ไม่ใช่ตัดสิทธิ์
  const seatMap = useMemo(() => {
    const map = new Map<string, SeatMatch>();
    for (const b of regs ?? []) {
      for (const s of b.seats) {
        const key = normalizeThaiName(`${s.firstNameTh} ${s.lastNameTh}`);
        if (!map.has(key)) {
          map.set(key, {
            firstName: s.firstNameTh,
            lastName: s.lastNameTh,
            prefix:
              s.titlePrefix === "อื่นๆ" ? s.titleCustom ?? "" : s.titlePrefix,
          });
        }
      }
    }
    return map;
  }, [regs]);

  // seat map มาช้ากว่าไฟล์ได้ (เพิ่งเลือกทัวร์นาเมนต์) → เติมชื่อ/คำนำหน้าให้แถว
  // ที่ผู้ใช้ยังไม่ได้แก้เอง
  useEffect(() => {
    if (seatMap.size === 0) return;
    setDivisions((divs) =>
      divs.map((d) => ({
        ...d,
        winners: d.winners.map((w, i) => {
          if (w.dirty) return w;
          const fresh = makeWinner(d.parsed, i, seatMap);
          return { ...fresh, place: w.place };
        }),
      })),
    );
  }, [seatMap]);

  const categoryByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories ?? []) map.set(c.name.trim(), c.code);
    return map;
  }, [categories]);

  function onFiles(files: FileList | File[]) {
    void (async () => {
      const errors: string[] = [];
      const parsed: ParsedDivision[] = [];
      for (const file of Array.from(files)) {
        if (!/\.xml$/i.test(file.name)) {
          errors.push(`ข้ามไฟล์ “${file.name}” — รับเฉพาะ .xml`);
          continue;
        }
        try {
          parsed.push(parseMacmahonXml(file.name, await file.text()));
        } catch (e) {
          errors.push((e as Error).message);
        }
      }
      setParseErrors(errors);
      if (parsed.length > 0) {
        setResult(undefined);
        setSavedRows([]);
        setDivisions((prev) => {
          const next = prev.filter(
            (d) => !parsed.some((p) => p.fileName === d.parsed.fileName),
          );
          for (const p of parsed) next.push(makeDivision(p, defaultPlaces, seatMap));
          return next.sort((a, b) =>
            a.parsed.fileName.localeCompare(b.parsed.fileName, "th"),
          );
        });
      }
    })();
  }

  function patchDivision(fileName: string, patch: Partial<DivisionState>) {
    setDivisions((divs) =>
      divs.map((d) => (d.parsed.fileName === fileName ? { ...d, ...patch } : d)),
    );
  }

  function setPlaces(d: DivisionState, places: number) {
    const n = Math.max(1, Math.min(places, MAX_PLACES));
    const winners = Array.from(
      { length: Math.min(n, Math.max(n, d.winners.length)) },
      (_, i) => d.winners[i] ?? makeWinner(d.parsed, i, seatMap),
    ).slice(0, n);
    patchDivision(d.parsed.fileName, { places: n, winners });
  }

  function patchWinner(
    d: DivisionState,
    key: string,
    patch: Partial<WinnerRow>,
  ) {
    // dirty (= อย่าให้ seat-matching เขียนทับ) เฉพาะเมื่อแตะชื่อ/คำนำหน้า —
    // การแก้แค่อันดับต้องไม่ freeze การเติมชื่ออัตโนมัติ
    const touchesIdentity =
      "firstName" in patch || "lastName" in patch || "prefix" in patch;
    patchDivision(d.parsed.fileName, {
      winners: d.winners.map((w) =>
        w.key === key
          ? { ...w, ...patch, dirty: w.dirty || touchesIdentity }
          : w,
      ),
    });
  }

  function removeDivision(fileName: string) {
    setDivisions((divs) => divs.filter((d) => d.parsed.fileName !== fileName));
  }

  // ── validation ─────────────────────────────────────────────────────────────
  /** ปัญหาที่ "ต้องแก้" ของรุ่นเดียว — ใช้ทั้งป้ายสถานะบนการ์ดและรายการรวมด้านล่าง */
  function divisionBlockers(d: DivisionState): string[] {
    const list: string[] = [];
    if (!awardKyu(d.label)) {
      list.push(`ระดับ “${d.label}” แปลงเป็น rank ไม่ได้`);
    }
    for (const w of d.winners) {
      if (!w.firstName.trim() || !w.lastName.trim()) {
        list.push(`อันดับ ${w.place} ยังไม่มีชื่อ-นามสกุล`);
      }
    }
    return list;
  }

  /** เรื่องที่ "ควรดู" แต่ไม่บล็อกการบันทึก */
  function divisionCautions(d: DivisionState): string[] {
    const list: string[] = [];
    if (divisionTies(d).boundaryTie) list.push("มีคะแนนเสมอในช่วงอันดับรางวัล");
    const seen = new Set<number>();
    if (d.winners.some((w) => (seen.has(w.place) ? true : (seen.add(w.place), false)))) {
      list.push("มีอันดับซ้ำกัน");
    }
    if (tid) {
      const unmatched = d.winners.filter((w) => !w.seatMatched && !w.dirty).length;
      if (unmatched > 0) list.push(`${unmatched} คนไม่พบในใบสมัคร`);
    }
    if (d.parsed.warnings.length > 0) list.push(`${d.parsed.warnings.length} คำเตือนจากไฟล์`);
    return list;
  }

  const problems = useMemo(() => {
    const list: string[] = [];
    if (divisions.length === 0) return list;
    if (!eventName.trim()) list.push("กรอกชื่อรายการแข่งขัน");
    if (!eventDate.trim()) list.push("กรอกวันที่แข่งขัน");
    for (const d of divisions) {
      for (const b of divisionBlockers(d)) {
        list.push(`รุ่น “${d.parsed.divisionName}”: ${b}`);
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisions, eventName, eventDate]);

  const totalWinners = divisions.reduce((n, d) => n + d.winners.length, 0);
  /** สรุปผลจับคู่ใบสมัคร — ช่วยให้เห็นทันทีว่าเลือกทัวร์นาเมนต์ถูกไหม */
  const matchStats = useMemo(() => {
    if (!tid) return null;
    const rows = divisions.flatMap((d) => d.winners);
    return { matched: rows.filter((w) => w.seatMatched).length, total: rows.length };
  }, [divisions, tid]);
  const tieWarnings = divisions.filter((d) => divisionTies(d).boundaryTie);
  const dupPlaceWarnings = divisions.filter((d) => {
    const seen = new Set<number>();
    return d.winners.some((w) =>
      seen.has(w.place) ? true : (seen.add(w.place), false),
    );
  });

  // ── save ───────────────────────────────────────────────────────────────────
  function buildRows(): { db: GoPlayerImportRow[]; sheet: AwardSheetRow[] } {
    const db: GoPlayerImportRow[] = [];
    const sheet: AwardSheetRow[] = [];
    for (const d of divisions) {
      const rk = awardKyu(d.label)!;
      for (const w of d.winners) {
        const firstname = w.firstName.trim();
        const lastname = w.lastName.trim();
        const prefix = w.prefix.trim() || null;
        const category = d.categoryLabel.trim() || null;
        const sheetRow: AwardSheetRow = {
          prefix,
          firstname,
          lastname,
          category,
          rank_in_category: d.label.trim(),
          rank_award: w.place,
          event_name: eventName.trim(),
          date: eventDate.trim(),
          phone: null,
          organizer: organizer.trim() || null,
        };
        sheet.push(sheetRow);
        db.push({
          seq: null,
          prefix_th: prefix,
          first_name_th: firstname,
          last_name_th: lastname,
          first_name_th_normalized: normalizeThaiName(firstname),
          last_name_th_normalized: normalizeThaiName(lastname),
          rank: rk.rank,
          power_level: rk.power,
          rating: null,
          year_promoted: null,
          diamond: null,
          category,
          rank_in_category: d.label.trim(),
          rank_award: w.place,
          event_name: eventName.trim(),
          event_date: eventDate.trim(),
          // โครงเดียวกับแถวที่มาจาก master sheet (read RPC ไม่ expose raw_data)
          raw_data: { seq: null, ...sheetRow },
        });
      }
    }
    return { db, sheet };
  }

  async function save() {
    setBusy(true);
    setResult(undefined);
    setResultError(false);
    try {
      const { db, sheet } = buildRows();
      const summary = await dl.appendAwardRows(db);
      const imported = summary.imported ?? 0;
      const replaced = summary.replaced ?? 0;
      const updated = summary.updatedProfiles + summary.updatedPlayers;
      setSavedRows(sheet);
      setResult(
        `บันทึก ${imported.toLocaleString("th-TH")} รายการ` +
          (replaced > 0
            ? ` · แทนที่ของเดิม ${replaced} รายการ`
            : " · ไม่มีรายการเดิมถูกแทนที่") +
          ` · อัปเดตระดับผู้ใช้ ${updated} คน — อย่าลืมเอาไฟล์ไปวางใน master sheet`,
      );
      toast.show(`บันทึกรางวัล ${imported} รายการแล้ว`, "success");
      setConfirmOpen(false);
    } catch (e) {
      const m = (e as Error).message;
      setResultError(true);
      setResult(m === "UNAUTHORIZED" ? "ไม่มีสิทธิ์ (กรุณาเข้าสู่ระบบ admin ใหม่)" : m);
      toast.show("บันทึกไม่สำเร็จ", "error");
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function downloadSheet() {
    const buffer = buildAwardSheetXlsx(savedRows);
    download(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `รางวัล_${stampNow()}.xlsx`,
    );
    toast.show(`ดาวน์โหลดไฟล์ ${savedRows.length} แถวแล้ว`, "success");
  }

  function resetAll() {
    setDivisions([]);
    setParseErrors([]);
    setResult(undefined);
    setSavedRows([]);
  }

  const tournamentOptions = [
    { value: NO_TOURNAMENT, label: "— งานนอกระบบ (กรอกเอง) —" },
    ...(tournaments ?? []).map((t) => ({
      value: t.id,
      label: `${t.nameTh} (${t.competitionDate})`,
    })),
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="บันทึกรางวัล"
        description="อัปโหลดไฟล์ MacMahon (.xml ไฟล์ละรุ่น) — ระบบจัดอันดับจากผลการแข่งขันแล้วเลือกผู้ได้รางวัลให้ก่อน ตรวจแก้ชื่อและอันดับได้ ก่อนบันทึกเข้าฐาน AWARD พร้อมไฟล์สำหรับวางใน master sheet"
      />

      {/* ── ขั้นที่ 1: ไฟล์ ── */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <SectionTitle>
            <StepBadge n={1} /> ไฟล์ผลการแข่งขัน
          </SectionTitle>
          {busy && <Spinner className="h-4 w-4" />}
        </div>

        {divisions.length === 0 ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${
              dragging
                ? "border-brand-400/70 bg-brand-500/10"
                : "border-white/15 bg-white/[0.03] hover:border-brand-400/50 hover:bg-brand-500/[0.06]"
            }`}
          >
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-ink-faint"
              aria-hidden="true"
            >
              <path d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
            <span className="text-sm font-semibold text-ink">
              ลากไฟล์ .xml มาวาง หรือคลิกเพื่อเลือก
            </span>
            <span className="text-xs text-ink-tertiary">
              ไฟล์จากโปรแกรม MacMahon · ไฟล์ละ 1 รุ่น · เลือกพร้อมกันหลายไฟล์ได้
            </span>
            <input
              type="file"
              accept=".xml,text/xml,application/xml"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.length) onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label className={busy ? "cursor-wait" : "cursor-pointer"}>
              {/* `disabled:` never matches a <span>, so dim via state instead */}
              <span
                className={`inline-flex h-9 items-center rounded-xl bg-white/[0.06] px-3.5 text-sm font-semibold text-ink ring-1 ring-inset ring-white/12 transition hover:bg-white/[0.1] ${busy ? "opacity-50" : ""}`}
              >
                + เพิ่มไฟล์
              </span>
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                multiple
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  if (e.target.files?.length) onFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <span className="text-sm text-ink-secondary">
              {divisions.length} รุ่น · ผู้ได้รางวัลรวม{" "}
              <span className="font-semibold text-ink">{totalWinners}</span> คน
            </span>
            <button
              type="button"
              className="ml-auto text-xs font-semibold text-rose-300 transition hover:text-rose-200 disabled:opacity-50"
              onClick={resetAll}
              disabled={busy}
            >
              ล้างทั้งหมด
            </button>
          </div>
        )}

        {parseErrors.length > 0 && (
          <div className="space-y-1 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-inset ring-rose-400/20">
            {parseErrors.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </div>
        )}
      </Card>

      {/* ── ขั้นที่ 2: ข้อมูลรายการ (มีความหมายก็ต่อเมื่อมีไฟล์แล้ว) ── */}
      {divisions.length > 0 && (
        <Card className="space-y-3 p-4">
          <SectionTitle>
            <StepBadge n={2} /> ข้อมูลรายการแข่งขัน
          </SectionTitle>

          <Field
            label="ทัวร์นาเมนต์ในระบบ"
            hint={
              matchStats
                ? `เติมชื่อ/วันที่ให้ และจับคู่ชื่อกับใบสมัครได้ ${matchStats.matched} จาก ${matchStats.total} คน`
                : "เลือกเพื่อเติมชื่อรายการ วันที่ และคำนำหน้าให้อัตโนมัติ · งานนอกระบบให้กรอกเอง"
            }
          >
            <Combobox
              value={tid}
              onChange={(v) => {
                userTouchedTournament.current = true;
                setTid(v);
                const t = (tournaments ?? []).find((x) => x.id === v);
                if (t) {
                  setEventName(t.nameTh);
                  setEventDate(toSheetDate(t.competitionDate));
                }
              }}
              options={tournamentOptions}
              placeholder="— งานนอกระบบ (กรอกเอง) —"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อรายการแข่งขัน" required>
              <TextInput
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="เช่น Buddy go x Piyachat Championship 2026"
                disabled={busy}
              />
            </Field>
            <Field
              label="วันที่แข่งขัน"
              required
              hint="รูปแบบเดียวกับ master sheet — Aug 9, 2026 หรือ Feb 21-22, 2026 สำหรับงานหลายวัน"
            >
              <TextInput
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                onBlur={(e) => setEventDate(toSheetDate(e.target.value))}
                placeholder="เช่น Aug 9, 2026"
                disabled={busy}
              />
            </Field>
            <Field label="ผู้จัด" hint="ไม่บังคับ">
              <TextInput
                value={organizer}
                onChange={(e) => setOrganizer(e.target.value)}
                placeholder="เช่น สมาคมกีฬาหมากล้อมฯ"
                disabled={busy}
              />
            </Field>
            <Field
              label="จำนวนรางวัลต่อรุ่น"
              hint="ค่าเริ่มต้นของไฟล์ที่อัปโหลดใหม่ · ปรับรายรุ่นได้ด้านล่าง"
            >
              <Select
                value={String(defaultPlaces)}
                onChange={(e) => setDefaultPlaces(Number(e.target.value))}
                disabled={busy}
              >
                {Array.from({ length: MAX_PLACES }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1} อันดับ
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {divisions.length > 0 && (
        <SectionTitle className="!mb-0 flex items-center gap-1.5 px-1">
          <StepBadge n={3} /> ตรวจผู้ได้รางวัลรายรุ่น
        </SectionTitle>
      )}

      {/* ── division cards ── */}
      {divisions.map((d) => {
        const rk = awardKyu(d.label);
        const catCode = categoryByName.get(d.label.trim());
        const topIds = new Set(
          awardable(d.parsed)
            .slice(0, d.places)
            .map((r) => r.playerId),
        );
        const { tiedIds } = divisionTies(d);
        const blockers = divisionBlockers(d);
        const cautions = divisionCautions(d);
        const shown = d.showAll
          ? d.parsed.standings
          : d.parsed.standings.slice(0, Math.max(d.places + 2, 5));
        return (
          <Card key={d.parsed.fileName} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SectionTitle>{d.parsed.divisionName}</SectionTitle>
                  {blockers.length > 0 ? (
                    <Pill tone="bad" size="sm">
                      ต้องแก้ {blockers.length}
                    </Pill>
                  ) : cautions.length > 0 ? (
                    <Pill tone="warn" size="sm">
                      ควรตรวจ
                    </Pill>
                  ) : (
                    <Pill tone="good" size="sm">
                      พร้อม
                    </Pill>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-tertiary">
                  {d.parsed.fileName} · {d.parsed.players.length} คน ·{" "}
                  {d.parsed.numberOfRounds} รอบ
                  {catCode ? ` · ตรงกับรุ่น ${catCode} ในระบบ` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-ink-tertiary">รางวัล</span>
                <Select
                  className="w-28 text-sm"
                  value={String(d.places)}
                  onChange={(e) => setPlaces(d, Number(e.target.value))}
                  disabled={busy}
                >
                  {Array.from({ length: MAX_PLACES }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} อันดับ
                    </option>
                  ))}
                </Select>
                <RowAction
                  tone="danger"
                  onClick={() => removeDivision(d.parsed.fileName)}
                  disabled={busy}
                  title="เอารุ่นนี้ออก"
                >
                  ✕
                </RowAction>
              </div>
            </div>

            {(d.parsed.warnings.length > 0 || (rk?.power === 14 && d.places > 3)) && (
              <div className="space-y-0.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2">
                {d.parsed.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-200/90">
                    {w}
                  </p>
                ))}
                {rk?.power === 14 && d.places > 3 && (
                  <p className="text-xs text-amber-200/90">
                    รุ่นนี้เทียบเท่า 1 คิว — อันดับ 4 ขึ้นไปที่บันทึกจะถูกนับรวมในเพดานรางวัล
                    1 คิว (แบนอัตโนมัติเมื่อครบ 3 รายการ) เช่นเดียวกับเหรียญ 1-3
                  </p>
                )}
              </div>
            )}

            {/* standings — อันดับ + ชื่อ เท่านั้น; คะแนน/SOS/SOSOS ใช้จัดอันดับ
                ภายในแต่ไม่แสดง (ยกเว้น ⚠ กรณีเสมอทุกตัวตัดสิน ที่ admin ต้องตัดสินเอง) */}
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="w-20 px-3 py-2 font-semibold">อันดับ</th>
                    <th className="px-3 py-2 font-semibold">ชื่อ</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => {
                    const inPodium = topIds.has(row.playerId);
                    const tied = tiedIds.has(row.playerId);
                    return (
                      <tr
                        key={row.playerId}
                        className={`border-t border-white/5 ${
                          inPodium ? "bg-brand-600/10" : ""
                        }`}
                      >
                        <td className="px-3 py-1.5 text-ink-secondary">
                          {row.place}
                          {tied && (
                            <span
                              className="ml-1 text-amber-300"
                              title="คะแนนเท่ากันทุกตัวตัดสิน — ตรวจสอบอันดับเอง"
                            >
                              ⚠
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-3 py-1.5 font-medium ${
                            row.placeholder ? "text-ink-faint italic" : "text-ink"
                          }`}
                        >
                          {row.fullName}
                          {row.placeholder ? " (ตัวแทนบาย)" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {d.parsed.standings.length > shown.length || d.showAll ? (
              <button
                type="button"
                className="text-xs font-semibold text-brand-400 hover:text-brand-300"
                onClick={() =>
                  patchDivision(d.parsed.fileName, { showAll: !d.showAll })
                }
              >
                {d.showAll
                  ? "ย่อตาราง"
                  : `ดูทั้งหมด ${d.parsed.standings.length} คน`}
              </button>
            ) : null}

            {/* division fields */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="ระดับ (rank_in_category)"
                error={
                  rk
                    ? undefined
                    : "แปลงเป็น rank ไม่ได้ — ใช้รูปแบบ “9x9”, “13x13”, “5-8 Kyu” หรือ “3 Kyu”"
                }
                hint={rk ? `จะบันทึกเป็น ${rk.rank}` : undefined}
              >
                <TextInput
                  value={d.label}
                  invalid={!rk}
                  onChange={(e) =>
                    patchDivision(d.parsed.fileName, { label: e.target.value })
                  }
                  disabled={busy}
                />
              </Field>
              <Field label="ชื่อรุ่น (category)">
                <TextInput
                  value={d.categoryLabel}
                  onChange={(e) =>
                    patchDivision(d.parsed.fileName, {
                      categoryLabel: e.target.value,
                    })
                  }
                  disabled={busy}
                />
              </Field>
            </div>

            {/* winners — ชื่อมาจากไฟล์แล้ว แก้ได้ทุกช่อง; บนจอแคบซ้อนเป็น 2 บรรทัด
                เพื่อไม่ให้ช่องชื่อไทยถูกบีบจนพิมพ์ไม่ได้ */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-ink-secondary">
                  ผู้ได้รางวัล {d.winners.length} คน
                </p>
                <p className="text-xs text-ink-faint">แก้ไขได้ทุกช่อง</p>
              </div>

              {/* หัวคอลัมน์ (เฉพาะจอกว้าง — จอแคบใช้ placeholder แทน) */}
              <div className="hidden grid-cols-[4.5rem_8.5rem_1fr_1fr] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint sm:grid">
                <span>อันดับ</span>
                <span>คำนำหน้า</span>
                <span>ชื่อ</span>
                <span>นามสกุล</span>
              </div>

              {d.winners.map((w) => (
                <div
                  key={w.key}
                  className="grid grid-cols-[4.5rem_1fr] items-center gap-2 sm:grid-cols-[4.5rem_8.5rem_1fr_1fr]"
                >
                  <TextInput
                    type="number"
                    min={1}
                    max={MAX_PLACES}
                    className="no-spinner text-center text-sm"
                    value={String(w.place)}
                    onChange={(e) =>
                      patchWinner(d, w.key, {
                        place: Math.max(
                          1,
                          Math.min(MAX_PLACES, Number(e.target.value) || 1),
                        ),
                      })
                    }
                    disabled={busy}
                    aria-label="อันดับ"
                  />
                  <Select
                    className="text-sm"
                    value={w.prefix}
                    onChange={(e) => patchWinner(d, w.key, { prefix: e.target.value })}
                    disabled={busy}
                    aria-label="คำนำหน้า"
                  >
                    <option value="">— คำนำหน้า —</option>
                    {TITLE_PREFIXES.filter((p) => p !== "อื่นๆ").map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    {w.prefix &&
                      !TITLE_PREFIXES.includes(
                        w.prefix as (typeof TITLE_PREFIXES)[number],
                      ) && <option value={w.prefix}>{w.prefix}</option>}
                  </Select>
                  <TextInput
                    className="col-start-2 text-sm sm:col-start-auto"
                    value={w.firstName}
                    placeholder="ชื่อ"
                    invalid={!w.firstName.trim()}
                    onChange={(e) =>
                      patchWinner(d, w.key, { firstName: e.target.value })
                    }
                    disabled={busy}
                    aria-label="ชื่อ"
                  />
                  <TextInput
                    className="col-start-2 text-sm sm:col-start-auto"
                    value={w.lastName}
                    placeholder="นามสกุล"
                    invalid={!w.lastName.trim()}
                    onChange={(e) =>
                      patchWinner(d, w.key, { lastName: e.target.value })
                    }
                    disabled={busy}
                    aria-label="นามสกุล"
                  />
                  {(w.splitAmbiguous || (tid && !w.seatMatched && !w.dirty)) && (
                    <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-span-2 sm:col-start-3">
                      {tid && !w.seatMatched && !w.dirty && (
                        <Pill tone="warn" size="sm">
                          ไม่พบในใบสมัคร
                        </Pill>
                      )}
                      {w.splitAmbiguous && (
                        <Pill tone="warn" size="sm">
                          ตรวจการแบ่งชื่อ-นามสกุล
                        </Pill>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {/* ── ยืนยัน + ผลลัพธ์ ── sticky ที่ก้นจอ เพราะการ์ดรุ่นยาวมาก
           การต้องเลื่อนผ่านทุกรุ่นเพื่อกดบันทึกคือความเจ็บปวดหลักของหน้านี้ */}
      {divisions.length > 0 && (
        // bottom-24 บนมือถือให้พ้น AdminDock (main มี pb-dock = 6.5rem อยู่แล้ว)
        <div className="sticky bottom-24 z-20 lg:bottom-3">
          <Card className="glass-strong space-y-2.5 p-3.5">
            {problems.length > 0 && (
              <details className="rounded-xl bg-rose-500/10 px-3 py-2 ring-1 ring-inset ring-rose-400/20">
                <summary className="cursor-pointer text-xs font-semibold text-rose-300">
                  ต้องแก้ {problems.length} จุดก่อนบันทึก
                </summary>
                <div className="mt-1 space-y-0.5">
                  {problems.map((p, i) => (
                    <p key={i} className="text-xs text-rose-300/90">
                      {p}
                    </p>
                  ))}
                </div>
              </details>
            )}
            {result && (
              <div
                className={
                  resultError
                    ? "rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-inset ring-rose-400/20"
                    : "rounded-xl bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/20"
                }
              >
                {result}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={busy || problems.length > 0 || totalWinners === 0}
                onClick={() => setConfirmOpen(true)}
              >
                บันทึก {totalWinners} รายการลงฐานรางวัล
              </Button>
              {savedRows.length > 0 && (
                <Button variant="success" size="sm" onClick={downloadSheet}>
                  ⬇ ไฟล์สำหรับ master sheet ({savedRows.length} แถว)
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void save()}
        title="ยืนยันบันทึกรางวัล"
        tone="primary"
        confirmLabel="บันทึก"
        loading={busy}
        description={`${divisions.length} รุ่น · ${totalWinners} รายการ · ${eventName.trim()} (${eventDate})`}
      >
        <div className="space-y-1 text-sm text-ink-secondary">
          <p>
            การบันทึกซ้ำด้วยชื่อรายการ วันที่ ระดับ และชื่อรุ่นเดิม
            จะแทนที่รายการเดิมของรุ่นนั้น (ไม่เพิ่มซ้ำ)
          </p>
          {tieWarnings.length > 0 && (
            <p className="text-amber-300">
              ⚠ มีคะแนนเสมอกันในช่วงอันดับรางวัลของ{" "}
              {tieWarnings.map((d) => `“${d.parsed.divisionName}”`).join(", ")} —
              ตรวจสอบอันดับก่อนบันทึก
            </p>
          )}
          {dupPlaceWarnings.length > 0 && (
            <p className="text-amber-300">
              ⚠ มีอันดับซ้ำกันใน{" "}
              {dupPlaceWarnings.map((d) => `“${d.parsed.divisionName}”`).join(", ")} —
              ตั้งใจให้ครองอันดับร่วมหรือไม่?
            </p>
          )}
          <p className="text-ink-tertiary">
            หลังบันทึกแล้ว อย่าลืมดาวน์โหลดไฟล์ .xlsx ไปวางใน master Google Sheet
            มิฉะนั้นการ Sync ฐาน AWARD ครั้งถัดไปจะลบรายการชุดนี้ทิ้ง
          </p>
        </div>
      </ConfirmSheet>
    </div>
  );
}
