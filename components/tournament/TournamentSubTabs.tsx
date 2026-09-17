"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Horizontal pill tabs for one tournament — the per-tournament homes of what
 *  used to be global routes. Rendered as PublicHeader's `below` row, so it
 *  carries no positioning of its own: the header owns the sticky box, the
 *  safe-area inset and the glass. (A nested backdrop-filter would break the
 *  header's blur anyway — ARCHITECTURE.md §8.) */
export function TournamentSubTabs({ tid }: { tid: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const base = `/t/${tid}`;

  // Overview is exact: rules has its own tab now, so the old catch-all match
  // would light two tabs at once on /t/<tid>/rules.
  const tabs = [
    { href: base, label: t.nav.overview, exact: true },
    { href: `${base}/schedule`, label: t.nav.schedule },
    { href: `${base}/rules`, label: t.nav.rules },
    { href: `${base}/participants`, label: t.nav.participants },
  ];

  return (
    <nav className="mx-auto flex max-w-app gap-1.5 overflow-x-auto px-4 pb-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              "focus-ring shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-brand-600 text-white"
                : "bg-white/[0.06] text-ink-tertiary hover:bg-white/10 hover:text-ink-secondary",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
