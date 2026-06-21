"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BatchWithSeats, Category, RegistrationStatus } from "@/lib/data/types";
import { useAuth } from "@/components/auth/AuthProvider";
import { useLiveQuery } from "@/lib/data/store";
import { PublicHeader } from "@/components/PublicHeader";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState, StatusBadge } from "@/components/ui/feedback";
import { formatThaiDateTime, formatThb, fullNameTh } from "@/lib/utils";

interface MyRegsData {
  regs: BatchWithSeats[];
  catMap: Record<string, Category>;
  tournMap: Record<string, string>;
}

export default function MyRegistrationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user)
      router.replace("/login?next=/my-registrations");
  }, [authLoading, user, router]);

  const { data, loading } = useLiveQuery<MyRegsData>(
    async (d) => {
      const regs = await d.listMyRegistrations();
      const tids = Array.from(new Set(regs.map((r) => r.batch.tournamentId)));
      const [catLists, tourns] = await Promise.all([
        Promise.all(tids.map((t) => d.listCategories(t))),
        Promise.all(tids.map((t) => d.getTournament(t))),
      ]);
      const catMap: Record<string, Category> = {};
      catLists.flat().forEach((c) => (catMap[c.id] = c));
      const tournMap: Record<string, string> = {};
      tourns.forEach((t) => {
        if (t) tournMap[t.id] = t.nameTh;
      });
      return { regs, catMap, tournMap };
    },
    [user?.id],
  );

  if (authLoading || !user) return <CenterLoader />;

  const regs = data?.regs ?? [];

  return (
    <>
      <PublicHeader back="/" title="สถานะการสมัคร" />
      <main className="mx-auto max-w-app px-4 py-4">
        <p className="mb-3 text-sm text-slate-500">
          ใบสมัครทั้งหมดของคุณ พร้อมสถานะและรุ่นที่ลงไว้
        </p>

        {loading ? (
          <CenterLoader />
        ) : regs.length === 0 ? (
          <EmptyState
            title="ยังไม่มีการสมัคร"
            description="เมื่อคุณสมัครแข่งขัน ใบสมัครและสถานะจะแสดงที่นี่"
            action={
              <Link
                href="/register"
                className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
              >
                สมัครแข่งขัน
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {regs.map(({ batch, seats }) => (
              <Card key={batch.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-800">
                      {data?.tournMap[batch.tournamentId] ?? "การแข่งขัน"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      รหัสใบสมัคร {batch.referenceCode} ·{" "}
                      {formatThaiDateTime(batch.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={batch.status} />
                </div>

                <ul className="mt-3 divide-y divide-slate-100 border-y border-slate-100">
                  {seats.map((s) => {
                    const cat = data?.catMap[s.categoryId];
                    return (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm text-slate-700">
                          {fullNameTh(s)}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-brand-700">
                          {cat ? `${cat.code} · ${cat.name}` : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 flex items-center justify-between">
                  <StatusNote status={batch.status} note={batch.adminNote} />
                  <span className="shrink-0 text-sm">
                    <span className="text-slate-400">ยอดรวม </span>
                    <span className="font-bold text-slate-800">
                      {formatThb(batch.totalAmountThb)} ฿
                    </span>
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

/** Short, human note explaining what each status means for the applicant. */
function StatusNote({
  status,
  note,
}: {
  status: RegistrationStatus;
  note?: string | null;
}) {
  switch (status) {
    case "confirmed":
      return (
        <span className="text-xs font-medium text-emerald-600">
          ✓ ยืนยันการสมัครเรียบร้อย
        </span>
      );
    case "pending_review":
      return (
        <span className="text-xs font-medium text-sky-600">
          ⏳ รอผู้จัดตรวจสอบสลิป
        </span>
      );
    case "rejected":
      return (
        <span className="text-xs font-medium text-rose-600">
          ✕ ถูกปฏิเสธ{note ? `: ${note}` : ""}
        </span>
      );
    case "pending_payment":
      return (
        <span className="text-xs font-medium text-amber-600">
          ยังไม่ได้ส่งสลิป — รอการชำระเงิน
        </span>
      );
    case "expired":
      return (
        <span className="text-xs font-medium text-slate-400">
          หมดเวลาจอง (ไม่ได้ชำระเงินทันเวลา)
        </span>
      );
    default:
      return <span className="text-xs text-slate-400">ยังไม่เสร็จสิ้น</span>;
  }
}
