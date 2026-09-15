"use client";

// /admin/registrations/print — ใบเช็กอินสำหรับปริ้น (PRODUCT-10).
// ก่อนหน้านี้ส่งออกได้แค่ CSV (ข้อมูลส่วนตัวครบทุกช่อง) กับ TXT ของ MacMahon
// โต๊ะลงทะเบียนจึงต้องเปิด CSV ใน Excel บนโน้ตบุ๊กของอาสาสมัคร หน้านี้พิมพ์
// รายชื่อแยกตามรุ่น พร้อมช่องเซ็นชื่อ — เอากระดาษไปวางที่โต๊ะได้เลย
// เช็กอินในระบบ (live_toggle_checkin) ยังต้องรอ MacMahon อัปโหลดคู่จับก่อน
// ใบนี้จึงเป็นทางเดียวที่ใช้ได้ก่อนรอบแรก

import { type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "@/lib/data/store";
import { useAdminTournament } from "@/components/admin/AdminTournamentContext";
import type { BatchWithSeats } from "@/lib/data/types";
import { groupByCategory } from "@/lib/export";
import { rankByPower } from "@/lib/rank";
import { ageFromDob } from "@/lib/age";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/form";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { formatThaiDate, fullNameTh } from "@/lib/utils";

export default function AdminCheckInSheetPage() {
  const { tournament, loading: tLoading } = useAdminTournament();
  const tid = tournament?.id;
  const [includePending, setIncludePending] = useState(false);
  const [withPhone, setWithPhone] = useState(false);

  const { data: categories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
    ["categories"],
  );
  const { data: regs, loading } = useLiveQuery(
    (d) => (tid ? d.listRegistrations(tid, "all") : Promise.resolve([])),
    [tid],
    ["registrations"],
  );

  // Same selection rule as the CSV/TXT exports: confirmed competitors, minus
  // anyone who withdrew, optionally plus those still awaiting review.
  const selected = useMemo<BatchWithSeats[]>(() => {
    const allow = new Set(
      includePending ? ["confirmed", "pending_review"] : ["confirmed"],
    );
    return (regs ?? [])
      .filter((b) => allow.has(b.batch.status))
      .map((b) => ({ ...b, seats: b.seats.filter((s) => !s.withdrawnAt) }))
      .filter((b) => b.seats.length > 0);
  }, [regs, includePending]);

  const groups = useMemo(
    () => groupByCategory(selected, categories ?? []),
    [selected, categories],
  );
  const total = groups.reduce((n, g) => n + g.seats.length, 0);

  if (tLoading || loading) return <CenterLoader label="กำลังโหลด…" />;
  if (!tournament) return <EmptyState title="ยังไม่มีรายการแข่งขัน" />;

  return (
    <div className="space-y-5">
      {/* Screen-only controls. `print:hidden` keeps them off the paper. */}
      <style>{PRINT_CSS}</style>

      <div className="print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-ink sm:text-xl">
              ใบเช็กอิน — สำหรับปริ้น
            </h1>
            <p className="mt-1 text-sm text-ink-tertiary">
              {tournament.nameTh} · {total} คน · {groups.length} รุ่น
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Link href="/admin/registrations">
              <Button variant="secondary">กลับ</Button>
            </Link>
            <Button onClick={() => window.print()} disabled={total === 0}>
              พิมพ์
            </Button>
          </div>
        </div>
        <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          <Checkbox
            checked={includePending}
            onChange={setIncludePending}
            label="รวมรายที่รอตรวจสอบ (ยังไม่ยืนยันการชำระเงิน)"
          />
          <Checkbox
            checked={withPhone}
            onChange={setWithPhone}
            label="แสดงเบอร์โทร (ใบนี้จะมีข้อมูลส่วนตัวเพิ่ม — เก็บ/ทำลายให้เรียบร้อย)"
          />
        </div>
      </div>

      {total === 0 ? (
        <EmptyState
          title="ยังไม่มีผู้เข้าแข่งขัน"
          description={
            includePending
              ? "ยังไม่มีใบสมัครที่ยืนยันหรือรอตรวจสอบ"
              : "ยังไม่มีใบสมัครที่ยืนยันแล้ว — ติ๊ก “รวมรายที่รอตรวจสอบ” เพื่อดูรายที่ค้าง"
          }
        />
      ) : (
        <div className="print-sheet space-y-6 rounded-2xl bg-white p-6 text-black">
          {groups.map((g) => (
            <section key={g.category.id} className="print-group">
              <header className="mb-2 border-b-2 border-black pb-1.5">
                <h2 className="text-base font-bold">
                  {g.category.code} · {g.category.name}
                </h2>
                <p className="text-xs">
                  {tournament.nameTh} · แข่งวันที่{" "}
                  {formatThaiDate(tournament.competitionDate, "th")} ·{" "}
                  {g.seats.length} คน
                </p>
              </header>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <Th className="w-8">#</Th>
                    <Th>ชื่อ - นามสกุล</Th>
                    <Th className="w-20">ระดับ</Th>
                    <Th className="w-12">อายุ</Th>
                    <Th>สถาบัน</Th>
                    {withPhone && <Th className="w-24">เบอร์โทร</Th>}
                    <Th className="w-28">ลงชื่อเช็กอิน</Th>
                  </tr>
                </thead>
                <tbody>
                  {g.seats.map((s, i) => (
                    <tr key={s.id}>
                      <Td className="text-center">{i + 1}</Td>
                      <Td className="font-medium">{fullNameTh(s)}</Td>
                      <Td>{rankByPower(s.powerLevel)?.th ?? "—"}</Td>
                      <Td className="text-center">{ageFromDob(s.dob) ?? "—"}</Td>
                      <Td>{s.instituteName ?? "—"}</Td>
                      {withPhone && <Td>{s.phone}</Td>}
                      {/* Blank signature box — the point of the sheet. */}
                      <Td>&nbsp;</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`border border-black/60 bg-black/[0.06] px-1.5 py-1 text-left font-bold ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={`border border-black/40 px-1.5 py-1.5 align-middle ${className ?? ""}`}>
      {children}
    </td>
  );
}

/** The app is a dark glass theme; paper is white. Force the printed page to
 *  plain black-on-white, hide the admin shell's chrome, and keep each รุ่น on
 *  its own sheet so the desk can hand one table to each queue.
 *  `print-color-adjust: exact` keeps the header shading; without it some
 *  browsers drop every background and the table header stops reading as one. */
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .print-sheet, .print-sheet * { visibility: visible !important; }
  .print-sheet {
    position: absolute; inset: 0 auto auto 0; width: 100%;
    background: #fff !important; color: #000 !important;
    padding: 0 !important; border-radius: 0 !important;
    print-color-adjust: exact; -webkit-print-color-adjust: exact;
  }
  .print-group { break-after: page; page-break-after: always; }
  .print-group:last-child { break-after: auto; page-break-after: auto; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
}
`;
