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
        className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_6px_18px_-8px_rgba(10,132,255,0.9)] transition hover:bg-brand-500 active:scale-[0.97]"
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
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-[0_4px_12px_-4px_rgba(10,132,255,0.8)] ring-1 ring-white/20 transition active:scale-95"
        aria-label="เมนูบัญชี"
      >
        {initial}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl py-1 animate-scale-in">
            <p className="truncate px-3.5 py-2.5 text-xs text-white/45">
              {user.email}
            </p>
            <div className="mx-2 mb-1 border-t border-white/10" />
            <MenuLink href="/my-registrations" onClick={() => setOpen(false)}>
              สถานะการสมัคร
            </MenuLink>
            <MenuLink href="/profile" onClick={() => setOpen(false)}>
              โปรไฟล์ของฉัน
            </MenuLink>
            <MenuLink href="/account" onClick={() => setOpen(false)}>
              ผู้เล่นในกำกับ
            </MenuLink>
            <div className="mx-2 my-1 border-t border-white/10" />
            <button
              onClick={async () => {
                setOpen(false);
                await signOut();
                router.push("/");
              }}
              className="block w-full px-3.5 py-2.5 text-left text-sm font-medium text-rose-300 transition hover:bg-rose-500/10"
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
      className="block px-3.5 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
    >
      {children}
    </Link>
  );
}
