"use client";

import Link from "next/link";
import { useLiveQuery } from "@/lib/data/store";
import { Category, remainingSeats, Tournament } from "@/lib/data/types";
import { formatThaiDateTime } from "@/lib/utils";
import { PublicHeader } from "@/components/PublicHeader";
import { CategoryTable } from "@/components/home/CategoryTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CenterLoader, EmptyState, Pill } from "@/components/ui/feedback";
import {
  ActionBarSpacer,
  StickyActionBar,
} from "@/components/ui/StickyActionBar";

type WindowState = "not_published" | "before" | "open" | "closed";

function regWindow(t: Tournament): WindowState {
  if (t.status !== "published") return "not_published";
  const now = Date.now();
  if (now < Date.parse(t.registrationOpensAt)) return "before";
  if (now >= Date.parse(t.registrationClosesAt)) return "closed";
  return "open";
}

export default function HomeClient() {
  const { data: tournament, loading } = useLiveQuery(
    (d) => d.getActiveTournament(),
    [],
  );
  const tid = tournament?.id;
  const { data: categories } = useLiveQuery(
    (d) => (tid ? d.listCategories(tid) : Promise.resolve([])),
    [tid],
  );

  if (loading) return <CenterLoader label="กำลังโหลด…" />;

  if (!tournament) {
    return (
      <>
        <PublicHeader />
        <main className="mx-auto max-w-app px-4 py-10">
          <EmptyState
            title="ยังไม่มีการแข่งขันที่เปิดรับสมัคร"
            description="โปรดติดตามรายการแข่งขันเร็ว ๆ นี้"
          />
        </main>
      </>
    );
  }

  const cats: Category[] = categories ?? [];
  const win = regWindow(tournament);
  const allFull =
    cats.length > 0 && cats.every((c) => remainingSeats(c) === 0);
  const canRegister = win === "open" && !allFull;

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-app px-4 pb-4 pt-3">
        {/* Banner */}
        <div className="overflow-hidden rounded-2xl">
          {tournament.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tournament.bannerUrl}
              alt={tournament.nameTh}
              className="h-44 w-full object-cover sm:h-56"
            />
          ) : (
            <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-5 sm:h-56">
              <p className="text-center text-xl font-bold text-white/90">
                {tournament.nameTh}
              </p>
            </div>
          )}
        </div>

        {/* Title + status */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <RegStatusPill win={win} full={allFull} />
          </div>
          <h1 className="mt-2 text-xl font-bold leading-snug text-slate-900">
            {tournament.nameTh}
          </h1>
        </div>

        {/* Meta */}
        <Card className="mt-3 divide-y divide-slate-100">
          <MetaRow icon="📅" label="วันที่แข่งขัน" value={tournament.competitionDate} />
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="text-lg">📍</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-400">สถานที่แข่งขัน</p>
              <p className="font-medium text-slate-800">
                {tournament.locationText}
              </p>
              {tournament.locationMapsUrl && (
                <a
                  href={tournament.locationMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand-700"
                >
                  เปิดใน Google Maps
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-9 9M10 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-4" />
                  </svg>
                </a>
              )}
            </div>
          </div>
          <MetaRow
            icon="🟢"
            label="เปิดรับสมัคร"
            value={formatThaiDateTime(tournament.registrationOpensAt)}
          />
          <MetaRow
            icon="🔴"
            label="ปิดรับสมัคร"
            value={formatThaiDateTime(tournament.registrationClosesAt)}
          />
        </Card>

        {/* Categories */}
        <section className="mt-5">
          <h2 className="mb-2 text-base font-bold text-slate-900">
            ประเภทการแข่งขันที่เปิดรับ
          </h2>
          <CategoryTable categories={cats} />
        </section>

        {/* Secondary actions */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          <LinkButton href="/schedule" label="กำหนดการ" icon="🗓️" />
          <LinkButton href="/rules" label="กฎ กติกา" icon="📜" />
          <LinkButton href="/participants" label="รายชื่อ" icon="👥" />
        </div>

        {/* Desktop register button */}
        <div className="mt-4 hidden sm:block">
          <RegisterButton canRegister={canRegister} win={win} full={allFull} />
        </div>

        <ActionBarSpacer />
      </main>

      {/* Mobile sticky register */}
      <StickyActionBar className="sm:hidden">
        <RegisterButton canRegister={canRegister} win={win} full={allFull} />
      </StickyActionBar>
    </>
  );
}

function RegisterButton({
  canRegister,
  win,
  full,
}: {
  canRegister: boolean;
  win: WindowState;
  full: boolean;
}) {
  if (canRegister) {
    return (
      <Link href="/register">
        <Button fullWidth>สมัครการแข่งขัน</Button>
      </Link>
    );
  }
  const label = full
    ? "ที่นั่งเต็มทุกรุ่น"
    : win === "before"
      ? "ยังไม่เปิดรับสมัคร"
      : win === "closed"
        ? "ปิดรับสมัครแล้ว"
        : "ยังไม่เปิดรับสมัคร";
  return (
    <Button fullWidth disabled>
      {label}
    </Button>
  );
}

function RegStatusPill({ win, full }: { win: WindowState; full: boolean }) {
  if (win === "open" && !full) return <Pill tone="good">เปิดรับสมัคร</Pill>;
  if (win === "open" && full) return <Pill tone="bad">ที่นั่งเต็ม</Pill>;
  if (win === "before") return <Pill tone="warn">ยังไม่เปิดรับสมัคร</Pill>;
  if (win === "closed") return <Pill tone="bad">ปิดรับสมัครแล้ว</Pill>;
  return <Pill tone="neutral">เร็ว ๆ นี้</Pill>;
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="text-lg">{icon}</span>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="font-medium text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function LinkButton({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white py-3 text-center text-sm font-medium text-slate-700 transition hover:border-brand-300 hover:bg-brand-50"
    >
      <span className="text-xl">{icon}</span>
      {label}
    </Link>
  );
}
