import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Canonical page header: title + optional description + optional right-aligned
 * action. Every admin page opens with this before its content so titles,
 * descriptions and primary actions line up across the whole back-office.
 * `size="xl"` is for dashboard-level pages; list/data pages use the default lg.
 */
export function PageHeader({
  title,
  description,
  action,
  size = "lg",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  size?: "lg" | "xl";
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1
          className={cn(
            "font-bold tracking-tight text-white",
            // Responsive so desktop keeps a large title (it replaces the old
            // shell header) while mobile stays compact.
            size === "xl" ? "text-xl sm:text-2xl" : "text-lg sm:text-xl",
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-white/45">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** The one in-card section label. Kept co-located with PageHeader so the header
 *  system lives in one place; existing importers of SectionTitle from Card still
 *  work (that export is unchanged). */
export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-xs font-semibold uppercase tracking-wider text-white/40",
        className,
      )}
    >
      {children}
    </p>
  );
}
