"use client";

import Link from "next/link";
import { useLiveQuery } from "@/lib/data/store";
import { Category, remainingSeats, Tournament } from "@/lib/data/types";
import { formatThaiDateTime } from "@/lib/utils";
import { PublicHeader } from "@/components/PublicHeader";
import { CategoryTable } from "@/components/home/CategoryTable";
import { Button } from "@/components/ui/Button";
import { CenterLoader, EmptyState, Pill } from "@/components/ui/feedback";

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
        <main className="mx-auto max-w-app px-4 pb-dock pt-10">
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
  const allFull = cats.length > 0 && cats.every((c) => remainingSeats(c) === 0);
  const canRegister = win === "open" && !allFull;

  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-app px-4 pb-dock pt-3">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 shadow-[0_20px_50px_-24px_rgba(0,0,0,0.8)]">
          {tournament.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tournament.bannerUrl}
              alt={tournament.nameTh}
              className="h-52 w-full object-cover sm:h-60"
            />
          ) : (
            <div className="h-52 w-full bg-gradient-to-br from-brand-600 via-brand-800 to-[#06122a] sm:h-60" />
          )}
          {/* scrim + title overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <RegStatusPill win={win} full={allFull} />
            <h1 className="mt-2 text-xl font-bold leading-snug text-white text-balance drop-shadow">
              {tournament.nameTh}
            </h1>
          </div>
        </div>

        {/* Primary CTA */}
        <div className="mt-4">
          <RegisterButton canRegister={canRegister} win={win} full={allFull} />
        </div>

        {/* Meta */}
        <div className="glass-card mt-4 divide-y divide-white/[0.07] rounded-3xl">
          <MetaRow icon={<IconCal />} label="วันที่แข่งขัน" value={tournament.competitionDate} />
          <div className="flex items-start gap-3 px-4 py-3.5">
            <IconWrap><IconPin /></IconWrap>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-white/45">สถานที่แข่งขัน</p>
              <p className="font-medium text-white/90">{tournament.locationText}</p>
              {tournament.locationMapsUrl && (
                <a
                  href={tournament.locationMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand-300 transition hover:text-brand-200"
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
            icon={<IconDot className="text-emerald-400" />}
            label="เปิดรับสมัคร"
            value={formatThaiDateTime(tournament.registrationOpensAt)}
          />
          <MetaRow
            icon={<IconDot className="text-rose-400" />}
            label="ปิดรับสมัคร"
            value={formatThaiDateTime(tournament.registrationClosesAt)}
          />
        </div>

        {/* Categories */}
        <section className="mt-6">
          <h2 className="mb-2.5 text-base font-bold text-white">
            ประเภทการแข่งขันที่เปิดรับ
          </h2>
          <CategoryTable categories={cats} />
        </section>

        {/* Secondary actions */}
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <LinkButton href="/schedule" label="กำหนดการ" icon={<IconCal />} />
          <LinkButton href="/rules" label="กฎ กติกา" icon={<IconDoc />} />
          <LinkButton href="/participants" label="รายชื่อ" icon={<IconUsers />} />
        </div>
      </main>
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

function IconWrap({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 ring-1 ring-inset ring-white/10">
      {children}
    </span>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <IconWrap>{icon}</IconWrap>
      <div className="min-w-0">
        <p className="text-xs text-white/45">{label}</p>
        <p className="font-medium text-white/90">{value}</p>
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
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="hover-glass flex flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] py-3.5 text-center text-sm font-medium text-white/80"
    >
      <span className="text-brand-300">{icon}</span>
      {label}
    </Link>
  );
}

/* --- inline icons (stroke = currentColor) --- */
function IconCal() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3v3M17 3v3M4 8.5h16M5 5.5h14a1 1 0 011 1V20a1 1 0 01-1 1H5a1 1 0 01-1-1V6.5a1 1 0 011-1z" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21s-6.5-5.6-6.5-10.5A6.5 6.5 0 0112 4a6.5 6.5 0 016.5 6.5C18.5 15.4 12 21 12 21z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </svg>
  );
}
function IconDoc() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 3h7l4 4v14a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zM13 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 19v-1.5a3.5 3.5 0 00-3.5-3.5h-5A3.5 3.5 0 004 17.5V19M10 10.5a3 3 0 100-6 3 3 0 000 6zM20 19v-1.5a3.5 3.5 0 00-2.6-3.4M15.5 4.6a3 3 0 010 5.8" />
    </svg>
  );
}
function IconDot({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="12" r="6" />
    </svg>
  );
}
