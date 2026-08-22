"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Horizontal pill tabs under the header on every /t/[tid] page — the
 *  per-tournament homes of what used to be global routes. */
export function TournamentSubTabs({ tid }: { tid: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const base = `/t/${tid}`;

  const tabs = [
    { href: base, label: t.tourn.tabOverview, exact: true },
    { href: `${base}/schedule`, label: t.nav.schedule },
    { href: `${base}/rules`, label: t.nav.rules },
    { href: `${base}/participants`, label: t.nav.participants },
  ];

  return (
    <nav className="sticky top-[calc(3.25rem+env(safe-area-inset-top))] z-20 border-b border-white/[0.07] bg-[rgb(var(--bg))]/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-app gap-1.5 overflow-x-auto px-4 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-600 text-white"
                  : "bg-white/[0.06] text-white/60 hover:bg-white/10 hover:text-white/85",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
