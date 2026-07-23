"use client";

import { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Compact inline action for list/table rows (แก้ไข / ลบ). Comfortable 40px tap
 * target on mobile, collapsing to the original dense 32px on desktop (`lg:`), so
 * the many hand-rolled edit/delete buttons across the admin collapse onto one
 * recipe. `rounded-lg` is the sanctioned exception to the radius ladder for tiny
 * inline actions.
 */
export function RowAction({
  tone = "brand",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "brand" | "danger" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 lg:h-8 lg:px-3 lg:text-xs",
        tone === "danger"
          ? "text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 focus-visible:ring-rose-400/60"
          : "text-brand-300 hover:bg-brand-500/10 hover:text-brand-200 focus-visible:ring-brand-400/60",
        className,
      )}
      {...rest}
    />
  );
}

/** Label-style destructive text button (ลบรูป / ลบไฟล์ / ลบตาราง). One recipe so
 *  every "delete" text affordance in the admin looks identical. */
export const dangerGhost =
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2.5 text-sm font-medium text-rose-300 outline-none transition-colors hover:bg-rose-500/10 hover:text-rose-200 focus-visible:ring-2 focus-visible:ring-rose-400/60 lg:py-1.5";
