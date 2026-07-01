"use client";

import Link from "next/link";
import { ReactNode, useState } from "react";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { seedDemo } from "@/lib/demo-seed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { formatThaiDate, formatThaiDateTime } from "@/lib/utils";

export default function AdminOverviewPage() {
  const dl = useDataLayer();
  const toast = useToast();
  const [seeding, setSeeding] = useState(false);

  const { data: tournament, loading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  const tid = tournament?.id;
  const { data: regs } = useLiveQuery(
    (d) => (tid ? d.listRegistrations(tid, "all") : Promise.resolve([])),
    [tid],
  );
  const { data: categories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
  );

  if (loading) return <CenterLoader label="กำลังโหลด…" />;

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

  const pendingReview =
    regs?.filter((r) => r.batch.status === "pending_review").length ?? 0;
  const confirmed =
    regs?.filter((r) => r.batch.status === "confirmed").length ?? 0;
  const confirmedSeats =
    regs
      ?.filter((r) => r.batch.status === "confirmed")
      .reduce((sum, r) => sum + r.seats.length, 0) ?? 0;
  const totalCapacity = categories?.reduce((s, c) => s + c.capacity, 0) ?? 0;

  return (
    <div className="space-y-6">
      {/* Current tournament banner */}
      <Card className="relative overflow-hidden p-5">
        <div className="absolute right-0 top-0 h-32 w-32 -translate-y-8 translate-x-8 rounded-full bg-brand-500/20 blur-3xl" />
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">
          รายการปัจจุบัน
        </p>
        <h2 className="mt-1.5 text-xl font-bold text-white">{tournament.nameTh}</h2>
        <p className="mt-1 text-sm text-white/55">
          {formatThaiDate(tournament.competitionDate)} · {tournament.locationText}
        </p>
        <p className="mt-2 text-xs text-white/40">
          ปิดรับสมัคร: {formatThaiDateTime(tournament.registrationClosesAt)}
        </p>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="รอตรวจสอบ"
          value={pendingReview}
          tone="sky"
          icon={<I d="M12 8v4l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" />}
        />
        <StatCard
          label="ยืนยันแล้ว (ใบ)"
          value={confirmed}
          tone="emerald"
          icon={<I d="M5 13l4 4L19 7" />}
        />
        <StatCard
          label="ผู้เข้าแข่งขันยืนยันแล้ว"
          value={confirmedSeats}
          tone="brand"
          icon={<I d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6z" />}
        />
        <StatCard
          label="ที่นั่งทั้งหมด"
          value={totalCapacity}
          tone="slate"
          icon={<I d="M4 7h16M4 12h16M4 17h16" />}
        />
      </div>

      {/* Quick actions */}
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-white/40">
          ทางลัด
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionCard
            href="/admin/registrations"
            title="ตรวจใบสมัคร"
            desc="ยืนยัน / ปฏิเสธการสมัคร"
            badge={pendingReview > 0 ? `${pendingReview} รอตรวจ` : undefined}
          />
          <ActionCard
            href="/admin/categories"
            title="จัดการรุ่น"
            desc={`${categories?.length ?? 0} รุ่น`}
          />
          <ActionCard
            href="/admin/tournament"
            title="แก้ไขรายการ"
            desc="ข้อมูล / เวลารับสมัคร"
          />
        </div>
      </div>
    </div>
  );
}

function I({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

function StatCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "sky" | "emerald" | "brand" | "slate";
  icon: ReactNode;
}) {
  const toneClass = {
    sky: "text-sky-300 bg-sky-400/15 ring-sky-400/25",
    emerald: "text-emerald-300 bg-emerald-400/15 ring-emerald-400/25",
    brand: "text-brand-300 bg-brand-500/15 ring-brand-400/25",
    slate: "text-white/70 bg-white/10 ring-white/15",
  }[tone];
  const numClass = {
    sky: "text-sky-300",
    emerald: "text-emerald-300",
    brand: "text-brand-200",
    slate: "text-white",
  }[tone];
  return (
    <Card className="p-4">
      <div
        className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ${toneClass}`}
      >
        {icon}
      </div>
      <p className={`text-3xl font-bold ${numClass}`}>{value}</p>
      <p className="mt-1 text-xs text-white/55">{label}</p>
    </Card>
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
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300 ring-1 ring-inset ring-amber-400/25">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-white/45">{desc}</p>
      </Card>
    </Link>
  );
}
