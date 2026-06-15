"use client";

import Link from "next/link";
import { useState } from "react";
import { useDataLayer, useLiveQuery } from "@/lib/data/store";
import { seedDemo } from "@/lib/demo-seed";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/Toast";
import { formatThaiDateTime } from "@/lib/utils";

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
  const totalCapacity =
    categories?.reduce((s, c) => s + c.capacity, 0) ?? 0;

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          รายการปัจจุบัน
        </p>
        <h1 className="mt-1 text-lg font-bold text-slate-800">
          {tournament.nameTh}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {tournament.competitionDate} · {tournament.locationText}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          ปิดรับสมัคร: {formatThaiDateTime(tournament.registrationClosesAt)}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="รอตรวจสอบ" value={pendingReview} tone="sky" />
        <StatCard label="ยืนยันแล้ว (ใบ)" value={confirmed} tone="emerald" />
        <StatCard label="ผู้เข้าแข่งขันยืนยันแล้ว" value={confirmedSeats} tone="brand" />
        <StatCard
          label="ที่นั่งทั้งหมด"
          value={totalCapacity}
          tone="slate"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/admin/registrations">
          <Card className="p-4 transition hover:border-brand-300 hover:shadow">
            <p className="font-semibold text-slate-800">ตรวจใบสมัคร</p>
            <p className="mt-1 text-sm text-slate-400">
              ยืนยัน/ปฏิเสธการสมัคร
            </p>
          </Card>
        </Link>
        <Link href="/admin/categories">
          <Card className="p-4 transition hover:border-brand-300 hover:shadow">
            <p className="font-semibold text-slate-800">จัดการรุ่น</p>
            <p className="mt-1 text-sm text-slate-400">
              {categories?.length ?? 0} รุ่น
            </p>
          </Card>
        </Link>
        <Link href="/admin/tournament">
          <Card className="p-4 transition hover:border-brand-300 hover:shadow">
            <p className="font-semibold text-slate-800">แก้ไขรายการ</p>
            <p className="mt-1 text-sm text-slate-400">
              ข้อมูล/เวลารับสมัคร
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "emerald" | "brand" | "slate";
}) {
  const toneClass = {
    sky: "text-sky-600",
    emerald: "text-emerald-600",
    brand: "text-brand-700",
    slate: "text-slate-600",
  }[tone];
  return (
    <Card className="p-4">
      <p className={`text-3xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </Card>
  );
}
