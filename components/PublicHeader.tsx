import Link from "next/link";
import { AccountMenu } from "@/components/auth/AccountMenu";

export function PublicHeader({
  back,
  title,
}: {
  back?: string;
  title?: string;
}) {
  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0 border-b border-white/10">
      <div className="mx-auto flex max-w-app items-center gap-2 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {back ? (
            <Link
              href={back}
              aria-label="ย้อนกลับ"
              className="-ml-1 rounded-xl p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          ) : (
            <Link
              href="/"
              aria-label="หน้าหลัก"
              className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_6px_16px_-6px_rgba(10,132,255,0.8)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-mark.svg" alt="" className="h-5 w-5" />
            </Link>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-white">
              {title ?? "TesujiReg"}
            </p>
            {!title && (
              <p className="text-[11px] leading-tight text-white/45">
                ระบบรับสมัครแข่งขันหมากล้อม
              </p>
            )}
          </div>
        </div>
        <AccountMenu />
      </div>
    </header>
  );
}
