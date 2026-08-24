"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { DropdownPanel } from "@/components/ui/DropdownPanel";
import { useI18n } from "@/lib/i18n";

export function AccountMenu({ subtle }: { subtle?: boolean }) {
  const { user, loading, signOut } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  if (loading) return <div className="h-9 w-9" />;

  if (!user) {
    // Subtle variant for screens that already carry a primary blue CTA
    // (tournament pages): one bright button per screen.
    return (
      <Link
        href="/login"
        className={
          subtle
            ? "focus-ring press rounded-xl bg-white/[0.06] px-3.5 py-2 text-sm font-semibold text-ink-secondary ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10 hover:text-ink"
            : "focus-ring press rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-glow-sm transition-colors hover:bg-brand-500"
        }
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
        onClick={() => setOpen((o) => !o)}
        className="focus-ring press flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-glow-sm ring-1 ring-white/20"
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
        <MenuLink href="/account/players" onClick={() => setOpen(false)}>
          {t.account.managedPlayers}
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
