"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export function AccountMenu() {
  const { user, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  if (loading) return <div className="h-9 w-9" />;

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-lg bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800"
      >
        เข้าสู่ระบบ
      </Link>
    );
  }

  const initial = user.email?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800"
        aria-label="เมนูบัญชี"
      >
        {initial}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <p className="truncate px-3 py-2 text-xs text-slate-400">
              {user.email}
            </p>
            <MenuLink href="/profile" onClick={() => setOpen(false)}>
              โปรไฟล์ของฉัน
            </MenuLink>
            <MenuLink href="/account" onClick={() => setOpen(false)}>
              ผู้เล่นในกำกับ
            </MenuLink>
            <button
              onClick={async () => {
                setOpen(false);
                await signOut();
                router.push("/");
              }}
              className="block w-full px-3 py-2.5 text-left text-sm font-medium text-rose-600 hover:bg-rose-50"
            >
              ออกจากระบบ
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      {children}
    </Link>
  );
}
