"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PublicHeader } from "@/components/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CenterLoader } from "@/components/ui/feedback";
import { useI18n } from "@/lib/i18n";
import {
  IconChevronRight,
  IconTicket,
  IconUser,
  IconUsers,
} from "@/components/icons";

/** บัญชี hub — the account tab's landing. Signed out it invites sign-in
 *  (the tab itself never disappears); signed in it fans out to profile,
 *  managed players, and my registrations, plus sign-out. */
export default function AccountHubClient() {
  const { t } = useI18n();
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  return (
    <>
      <PublicHeader title={t.account.title} />
      <main className="mx-auto max-w-app px-4 pb-dock pt-4">
        {loading ? (
          <CenterLoader />
        ) : !user ? (
          <Card className="flex flex-col items-center gap-4 px-5 py-9 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-white/50 ring-1 ring-inset ring-white/10">
              <IconUser size={28} />
            </span>
            <p className="text-sm leading-relaxed text-white/65">
              {t.account.signInPrompt}
            </p>
            <Link href="/login?next=/account" className="w-full">
              <Button fullWidth>{t.account.signIn}</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="flex items-center gap-3 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-base font-bold text-white ring-1 ring-white/20">
                {user.email?.[0]?.toUpperCase() ?? "U"}
              </span>
              <p className="min-w-0 truncate text-sm text-white/80">
                {user.email}
              </p>
            </Card>

            <Card className="divide-y divide-white/[0.07] p-0">
              <HubLink
                href="/profile"
                icon={<IconUser size={20} />}
                label={t.account.myProfile}
              />
              <HubLink
                href="/account/players"
                icon={<IconUsers size={20} />}
                label={t.account.managedPlayers}
              />
              <HubLink
                href="/my-registrations"
                icon={<IconTicket size={20} />}
                label={t.account.myRegistrations}
              />
            </Card>

            <Button
              fullWidth
              variant="danger"
              onClick={async () => {
                await signOut();
                router.push("/");
              }}
            >
              {t.account.signOut}
            </Button>
          </div>
        )}
      </main>
    </>
  );
}

function HubLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-white/[0.04]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-white/70 ring-1 ring-inset ring-white/10">
        {icon}
      </span>
      <span className="flex-1 font-medium text-white/85">{label}</span>
      <span className="text-white/30">
        <IconChevronRight size={18} />
      </span>
    </Link>
  );
}
