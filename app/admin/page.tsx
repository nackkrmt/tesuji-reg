"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState } from "react";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { seedDemo } from "@/lib/demo-seed";
import { Category, RegistrationStatus, remainingSeats } from "@/lib/data/types";
import { listDivisions } from "@/lib/live/client";
import { regWindow, type RegWindowState } from "@/lib/tournament-window";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { CenterLoader, EmptyState, ErrorState, Pill } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { cn, formatThaiDate, formatThaiDateTime, formatThb } from "@/lib/utils";

export default function AdminOverviewPage() {
  const dl = useDataLayer();
  const toast = useToast();
  const [seeding, setSeeding] = useState(false);

  const {
    data: tournament,
    loading,
    error,
    refetch,
  } = useLiveQuery((d) => d.getActiveTournament(), [], ["tournament"]);
  const tid = tournament?.id;
  const { data: regs } = useLiveQuery(
    (d) => (tid ? d.listRegistrations(tid, "all") : Promise.resolve([])),
    [tid],
    ["registrations"],
  );
  const { data: categories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
    ["categories"],
  );
  const { data: categoryStats } = useLiveQuery(
    (d) => (tid ? d.listCategoryStats(tid) : Promise.resolve([])),
    [tid],
    ["categories", "registrations"],
  );
  const { data: withdrawals } = useLiveQuery(
    (d) => (tid ? d.adminListWithdrawals(tid) : Promise.resolve([])),
    [tid],
    ["withdrawals"],
  );

  // Live-results divisions come from the live client (not the data layer), the
  // same way the home page reads them. Best-effort: the card just hides its
  // count if the read fails.
  const [divisionCount, setDivisionCount] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    listDivisions()
      .then((d) => active && setDivisionCount(d.length))
      .catch(() => active && setDivisionCount(null));
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <CenterLoader label="กำลังโหลด…" />;

  if (error) return <ErrorState onRetry={refetch} />;

  async function onSeed() {
    setSeeding(true);
    try {
      await seedDemo(dl);
      toast.show("สร้างรายการตัวอย่างและเผยแพร่แล้ว", "success");
    } finally {
      setSeeding(false);
    }
  }

  if (!tournament) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="ยังไม่มีรายการแข่งขัน"
          description="เริ่มต้นด้วยการสร้างรายการเอง หรือใส่ข้อมูลตัวอย่างเพื่อทดลองใช้งานทั้งระบบ"
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={onSeed} loading={seeding}>
                สร้างรายการตัวอย่าง (เดโม)
              </Button>
              <Link href="/admin/tournament">
                <Button variant="secondary">สร้างเอง</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const all = regs ?? [];
  const cats = categories ?? [];
  const stats = categoryStats ?? [];

  // ── Registration rollups ────────────────────────────────────────────────────
  const count = (s: RegistrationStatus) =>
    all.filter((r) => r.batch.status === s).length;
  const seats = (s: RegistrationStatus) =>
    all
      .filter((r) => r.batch.status === s)
      .reduce((sum, r) => sum + r.seats.length, 0);
  const revenue = (s: RegistrationStatus) =>
    all
      .filter((r) => r.batch.status === s)
      .reduce((sum, r) => sum + r.batch.totalAmountThb, 0);

  const pendingReview = count("pending_review");
  const pendingReviewSeats = seats("pending_review");
  const confirmedBatches = count("confirmed");
  const confirmedSeats = seats("confirmed");
  const pendingPayment = count("pending_payment");
  const inactive =
    count("rejected") + count("expired") + count("cancelled");

  const confirmedRevenue = revenue("confirmed");
  const pendingRevenue = revenue("pending_review");

  // Refunded withdrawals are netted out of the displayed revenue (the batch
  // totals themselves never change — see 20260709_0001 migration note).
  const refundedThb = (withdrawals ?? [])
    .filter((w) => w.refundStatus === "refunded")
    .reduce((s, w) => s + w.feeThb, 0);
  const netConfirmedRevenue = confirmedRevenue - refundedThb;

  // ── Capacity / per-รุ่น fill (prefer the admin stats RPC; fall back to the
  // category counter when stats aren't available). ────────────────────────────
  const catRows = cats
    .map((c) => {
      const st = stats.find((s) => s.categoryId === c.id);
      const remaining = st ? st.remaining : remainingSeats(c);
      const confirmed = st?.confirmed ?? 0;
      const held = st?.held ?? Math.max(0, c.capacity - remaining - confirmed);
      const taken = Math.max(0, c.capacity - remaining);
      return { c, remaining, confirmed, held, taken };
    })
    .sort((a, b) => b.taken / (b.c.capacity || 1) - a.taken / (a.c.capacity || 1));

  const totalCapacity = cats.reduce((s, c) => s + c.capacity, 0);
  const totalTaken = catRows.reduce((s, r) => s + r.taken, 0);
  const fillPct = totalCapacity > 0 ? Math.round((totalTaken / totalCapacity) * 100) : 0;
  const fullCount = catRows.filter((r) => r.c.capacity > 0 && r.remaining === 0).length;

  const win = regWindow(tournament);
  const closesInMs = Date.parse(tournament.registrationClosesAt) - Date.now();
  const closingSoon = win === "open" && closesInMs > 0 && closesInMs < 48 * 3600 * 1000;

  // ── Attention items (only surfaced when actionable) ─────────────────────────
  const alerts: Alert[] = [];
  if (tournament.status === "draft")
    alerts.push({
      tone: "neutral",
      title: "รายการยังไม่เผยแพร่",
      desc: "ผู้ใช้ยังมองไม่เห็น — เผยแพร่เพื่อเปิดรับสมัคร",
      href: "/admin/tournament",
      icon: ICON.eye,
    });
  if (pendingReview > 0)
    alerts.push({
      tone: "sky",
      title: `${pendingReview} ใบสมัครรอตรวจสอบ`,
      desc: `${pendingReviewSeats} ที่นั่ง · แตะเพื่อตรวจ`,
      href: "/admin/registrations",
      icon: ICON.eye,
    });
  if (closingSoon)
    alerts.push({
      tone: "amber",
      title: "ใกล้ปิดรับสมัคร",
      desc: `ปิด ${formatThaiDateTime(tournament.registrationClosesAt)}`,
      href: "/admin/tournament",
      icon: ICON.clock,
    });
  if (fullCount > 0)
    alerts.push({
      tone: "amber",
      title: `${fullCount} รุ่นเต็มแล้ว`,
      desc: "ดูอัตราการเต็ม / เพิ่มที่นั่ง",
      href: "/admin/categories",
      icon: ICON.users,
    });

  return (
    <>
      <PageHeader
        title="ภาพรวม"
        description="สรุปสถานะรายการแข่งขันและสิ่งที่ต้องดำเนินการ"
        size="xl"
      />
      <div className="space-y-6">
      {/* Current tournament banner */}
      <Card className="relative overflow-hidden p-5">
        <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">
              รายการปัจจุบัน
            </p>
            <h2 className="mt-1.5 text-xl font-bold text-white">{tournament.nameTh}</h2>
            <p className="mt-1 text-sm text-white/55">
              {formatThaiDate(tournament.competitionDate)} · {tournament.locationText}
            </p>
          </div>
          <Link
            href="/admin/tournament"
            className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/85 ring-1 ring-inset ring-white/10 transition hover:bg-white/15"
          >
            แก้ไข
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill status={tournament.status} />
          <RegWindowPill win={win} />
          <span className="text-xs text-white/45">
            {win === "before"
              ? `เปิดรับ ${formatThaiDateTime(tournament.registrationOpensAt)}`
              : win === "open"
                ? `ปิดรับ ${formatThaiDateTime(tournament.registrationClosesAt)}`
                : win === "closed"
                  ? `ปิดรับแล้ว ${formatThaiDateTime(tournament.registrationClosesAt)}`
                  : "ยังไม่เผยแพร่"}
          </span>
        </div>
      </Card>

      {/* Attention — things that need the admin's action */}
      <section>
        <SectionTitle className="mb-2.5">ต้องดำเนินการ</SectionTitle>
        {alerts.length === 0 ? (
          <Card className="flex items-center gap-3 p-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
              <I d="M5 13l4 4L19 7" />
            </span>
            <p className="text-sm text-white/70">
              ไม่มีรายการที่ต้องดำเนินการ — ทุกอย่างเรียบร้อย
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {alerts.map((a, i) => (
              <AlertCard key={i} {...a} />
            ))}
          </div>
        )}
      </section>

      {/* KPI stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          href="/admin/registrations"
          label="รอตรวจสอบ"
          value={pendingReview}
          sub={`${pendingReviewSeats} ที่นั่ง`}
          tone="sky"
          icon={<I d="M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" />}
        />
        <StatCard
          href="/admin/registrations"
          label="ผู้เข้าแข่งขันยืนยันแล้ว"
          value={confirmedSeats}
          sub={`${confirmedBatches} ใบสมัคร`}
          tone="emerald"
          icon={<I d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6z" />}
        />
        <StatCard
          href="/admin/categories"
          label="อัตราการเต็ม"
          value={`${fillPct}%`}
          sub={`${totalTaken}/${totalCapacity} ที่นั่ง`}
          tone="brand"
          icon={<I d="M4 7h16M4 12h16M4 17h16" />}
        />
        <StatCard
          label="รายได้ยืนยันแล้ว"
          value={`฿${formatThb(netConfirmedRevenue)}`}
          sub={
            [
              pendingRevenue > 0 ? `฿${formatThb(pendingRevenue)} รอตรวจ` : null,
              refundedThb > 0 ? `−฿${formatThb(refundedThb)} คืนเงินแล้ว` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"
          }
          tone="amber"
          icon={<I d="M12 3v18M8 7h6a2 2 0 010 4H8m0 0h8" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Registration funnel */}
        <section className="flex flex-col">
          <SectionTitle className="mb-2.5">สถานะใบสมัคร</SectionTitle>
          <Card className="flex-1 p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-3xl font-bold text-white">{all.length}</p>
              <p className="text-xs text-white/45">ใบสมัครทั้งหมด</p>
            </div>
            <FunnelBar
              segments={[
                { label: "ยืนยันแล้ว", value: confirmedBatches, className: "bg-emerald-400" },
                { label: "รอตรวจสอบ", value: pendingReview, className: "bg-sky-400" },
                { label: "รอชำระเงิน", value: pendingPayment, className: "bg-amber-400" },
                { label: "ปิด/ยกเลิก", value: inactive, className: "bg-white/25" },
              ]}
            />
          </Card>
        </section>

        {/* Live results status */}
        <section className="flex flex-col">
          <SectionTitle className="mb-2.5">ผลแข่งสด</SectionTitle>
          <Card className="flex flex-1 flex-col p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-400/25">
                <I d="M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white/90">
                  {divisionCount == null
                    ? "สถานะผลแข่ง"
                    : divisionCount > 0
                      ? `${divisionCount} รุ่นกำลังแสดงผล`
                      : "ยังไม่มีข้อมูลผลแข่ง"}
                </p>
                <p className="mt-0.5 text-xs text-white/45">
                  {divisionCount && divisionCount > 0
                    ? "อัปโหลดจาก MacMahon แล้ว — ผู้ชมดูได้ที่หน้า /live"
                    : "อัปโหลดผลจับคู่จาก MacMahon เพื่อเริ่มแสดงผล"}
                </p>
              </div>
            </div>
            <div className="mt-auto flex gap-2 pt-4">
              <Link
                href="/admin/live"
                className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-center text-xs font-semibold text-white/85 ring-1 ring-inset ring-white/10 transition hover:bg-white/15"
              >
                จัดการผลแข่ง
              </Link>
              <a
                href="/live"
                className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-center text-xs font-semibold text-white/85 ring-1 ring-inset ring-white/10 transition hover:bg-white/15"
              >
                เปิดหน้าผลแข่ง
              </a>
            </div>
          </Card>
        </section>
      </div>

      {/* Per-รุ่น fill */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <SectionTitle>อัตราการเต็มรายรุ่น</SectionTitle>
          <Link href="/admin/categories" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
            จัดการรุ่น →
          </Link>
        </div>
        {catRows.length === 0 ? (
          <Card className="p-5 text-sm text-white/45">ยังไม่มีรุ่น</Card>
        ) : (
          <Card className="divide-y divide-white/[0.06] p-2">
            {catRows.map((r) => (
              <CategoryFillRow key={r.c.id} {...r} />
            ))}
          </Card>
        )}
      </section>

      {/* Quick actions */}
      <section>
        <SectionTitle className="mb-2.5">ทางลัด</SectionTitle>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            href="/admin/registrations"
            title="ตรวจใบสมัคร"
            desc="ยืนยัน / ปฏิเสธการสมัคร"
            badge={pendingReview > 0 ? `${pendingReview} รอตรวจ` : undefined}
          />
          <ActionCard href="/admin/categories" title="จัดการรุ่น" desc={`${cats.length} รุ่น`} />
          <ActionCard href="/admin/tournament" title="แก้ไขรายการ" desc="ข้อมูล / เวลารับสมัคร / กำหนดการ" />
          <ActionCard href="/admin/live" title="ผลแข่งสด" desc="อัปโหลดผลจับคู่ / ตารางแข่ง" />
          <ActionCard href="/admin/judges" title="จัดการกรรมการ" desc="เพิ่ม / ถอดสิทธิ์กรรมการ" />
          <ActionCard href="/admin/institutes" title="สถาบัน" desc="รวม / จัดการสถาบันหมากล้อม" />
          <ActionCard href="/admin/codes" title="โค้ดส่วนลด" desc="สร้าง / จัดการโค้ด" />
          <ActionCard href="/admin/database" title="ฐานข้อมูล" desc="ข้อมูลนักกีฬา DAN / KYU" />
          <ActionCard href="/admin/reset" title="รีเซ็ตข้อมูล" desc="ล้างการสมัคร / รุ่น (อันตราย)" />
        </div>
      </section>
      </div>
    </>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────────

function I({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const ICON = {
  clock: "M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  users:
    "M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6z",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 14.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  warn: "M12 9v4M12 17h.01M10.3 3.9l-8 14A2 2 0 004 21h16a2 2 0 001.7-3l-8-14a2 2 0 00-3.4 0z",
} as const;

function StatusPill({ status }: { status: "draft" | "published" | "closed" }) {
  if (status === "published") return <Pill tone="good">เผยแพร่แล้ว</Pill>;
  if (status === "closed") return <Pill tone="bad">ปิดรายการ</Pill>;
  return <Pill tone="neutral">ร่าง</Pill>;
}

function RegWindowPill({ win }: { win: RegWindowState }) {
  if (win === "open") return <Pill tone="good">กำลังเปิดรับสมัคร</Pill>;
  if (win === "before") return <Pill tone="warn">ยังไม่เปิดรับ</Pill>;
  if (win === "closed") return <Pill tone="bad">ปิดรับแล้ว</Pill>;
  return <Pill tone="neutral">ยังไม่เผยแพร่</Pill>;
}

const toneRing: Record<Tone, string> = {
  sky: "text-sky-300 bg-sky-400/15 ring-sky-400/25",
  emerald: "text-emerald-300 bg-emerald-400/15 ring-emerald-400/25",
  brand: "text-brand-300 bg-brand-500/15 ring-brand-400/25",
  amber: "text-amber-300 bg-amber-400/15 ring-amber-400/25",
  rose: "text-rose-300 bg-rose-400/15 ring-rose-400/25",
  neutral: "text-white/70 bg-white/10 ring-white/15",
};
const toneNum: Record<Tone, string> = {
  sky: "text-sky-300",
  emerald: "text-emerald-300",
  brand: "text-brand-200",
  amber: "text-amber-200",
  rose: "text-rose-300",
  neutral: "text-white",
};

type Tone = "sky" | "emerald" | "brand" | "amber" | "rose" | "neutral";

function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone: Tone;
  icon: ReactNode;
  href?: string;
}) {
  const body = (
    <Card className={cn("p-4", href && "hover-glass transition")}>
      <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset", toneRing[tone])}>
        {icon}
      </div>
      <p className={cn("text-3xl font-bold", toneNum[tone])}>{value}</p>
      <p className="mt-1 text-xs text-white/55">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-white/35">{sub}</p>}
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

type Alert = { tone: Tone; title: string; desc: string; href: string; icon?: string };

function AlertCard({ tone, title, desc, href, icon }: Alert) {
  return (
    <Link href={href}>
      <Card className="hover-glass flex items-center gap-3 p-4 transition">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", toneRing[tone])}>
          <I d={icon ?? ICON.warn} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white/90">{title}</p>
          <p className="truncate text-xs text-white/45">{desc}</p>
        </div>
        <span className="shrink-0 text-white/30">
          <I d="M9 6l6 6-6 6" />
        </span>
      </Card>
    </Link>
  );
}

function FunnelBar({
  segments,
}: {
  segments: { label: string; value: number; className: string }[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="mt-4">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        {total > 0 &&
          segments.map(
            (s, i) =>
              s.value > 0 && (
                <div
                  key={i}
                  className={s.className}
                  style={{ width: `${(s.value / total) * 100}%` }}
                />
              ),
          )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.className)} />
            <span className="text-xs text-white/55">{s.label}</span>
            <span className="ml-auto text-xs font-semibold text-white/85">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryFillRow({
  c,
  remaining,
  confirmed,
  held,
}: {
  c: Category;
  remaining: number;
  confirmed: number;
  held: number;
}) {
  const cap = c.capacity || 1;
  const confPct = Math.min(100, (confirmed / cap) * 100);
  const heldPct = Math.min(100 - confPct, (held / cap) * 100);
  const full = c.capacity > 0 && remaining === 0;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white/90">{c.name}</span>
          <span className="shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-white/45">
            {c.code}
          </span>
          {full && (
            <span className="shrink-0">
              <Pill tone="bad" size="sm">
                เต็ม
              </Pill>
            </span>
          )}
        </div>
        <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div className="bg-emerald-400" style={{ width: `${confPct}%` }} />
          <div className="bg-amber-400/70" style={{ width: `${heldPct}%` }} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-white/85">
          {c.capacity - remaining}
          <span className="text-white/35">/{c.capacity}</span>
        </p>
        <p className="text-[11px] text-white/40">เหลือ {remaining}</p>
      </div>
    </div>
  );
}

function ActionCard({
  href,
  title,
  desc,
  badge,
}: {
  href: string;
  title: string;
  desc: string;
  badge?: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover-glass p-4 transition">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-white/90">{title}</p>
          {badge && (
            <span className="shrink-0">
              <Pill tone="warn" size="sm">
                {badge}
              </Pill>
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-white/45">{desc}</p>
      </Card>
    </Link>
  );
}
