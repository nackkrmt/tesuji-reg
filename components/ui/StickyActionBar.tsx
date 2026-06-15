"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fixed bottom action bar inside the safe-area. Place primary CTAs here so they
 * sit in the thumb zone on mobile. Add a matching bottom spacer to page content
 * (use <ActionBarSpacer/>) so nothing hides behind it.
 */
export function StickyActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur",
        className,
      )}
    >
      <div className="mx-auto max-w-app px-4 pt-3 pb-safe">{children}</div>
    </div>
  );
}

export function ActionBarSpacer() {
  return <div aria-hidden className="h-28" />;
}
