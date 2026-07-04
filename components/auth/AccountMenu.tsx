"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { DropdownPanel } from "@/components/ui/DropdownPanel";
import { useI18n } from "@/lib/i18n";
import { isJudgeMode, setJudgeMode } from "@/lib/judge-mode";

export function AccountMenu() {
  const { user, loading, signOut } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [judgeMode, setJudgeModeState] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  if (loading) return <div className="h-9 w-9" />;

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_6px_18px_-8px_rgba(10,132,255,0.9)] transition hover:bg-brand-500 active:scale-[0.97]"
      >
        {t.account.signIn}
      </Link>
    );
  }

  const initial = user.email?.[0]?.toUpperCase() ?? "U";

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => {
          setJudgeModeState(isJudgeMode());
          setOpen((o) => !o);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-[0_4px_12px_-4px_rgba(10,132,255,0.8)] ring-1 ring-white/20 transition active:scale-95"
        aria-label={t.account.menu}
      >
        {initial}
      </button>
      <DropdownPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        align="right"
        matchWidth={false}
        className="w-56 py-1"
      >
        <p className="truncate px-3.5 py-2.5 text-xs text-white/45">
          {user.email}
        </p>
        <div className="mx-2 mb-1 border-t border-white/10" />
        <MenuLink href="/my-registrations" onClick={() => setOpen(false)}>
          {t.account.myRegistrations}
        </MenuLink>
        <MenuLink href="/profile" onClick={() => setOpen(false)}>
          {t.account.myProfile}
        </MenuLink>
        <MenuLink href="/account" onClick={() => setOpen(false)}>
          {t.account.managedPlayers}
        </MenuLink>
        {judgeMode && (
          <>
            <div className="mx-2 my-1 border-t border-white/10" />
            <button
              onClick={() => {
                setJudgeMode(false);
                setJudgeModeState(false);
                setOpen(false);
              }}
              className="block w-full px-3.5 py-2.5 text-left text-sm font-medium text-white/85 transition hover:bg-white/10"
            >
              ออกจากโหมดกรรมการ
            </button>
          </>
        )}
        <div className="mx-2 my-1 border-t border-white/10" />
        <button
          onClick={async () => {
            setOpen(false);
            await signOut();
            router.push("/");
          }}
          className="block w-full px-3.5 py-2.5 text-left text-sm font-medium text-rose-300 transition hover:bg-rose-500/10"
        >
          {t.account.signOut}
        </button>
      </DropdownPanel>
    </>
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
