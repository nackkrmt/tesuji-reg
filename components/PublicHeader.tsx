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
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-app items-center gap-2 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {back ? (
          <Link
            href={back}
            aria-label="ย้อนกลับ"
            className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">
            碁
          </span>
        )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight text-slate-800">
              {title ?? "TesujiReg"}
            </p>
            {!title && (
              <p className="text-[11px] leading-tight text-slate-400">
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
