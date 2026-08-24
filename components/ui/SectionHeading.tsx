import { cn } from "@/lib/utils";

/** The public-surface section heading (the admin side keeps its own
 *  SectionTitle): bold base-size ink, an optional tabular count on the
 *  baseline, and an optional trailing action. */
export function SectionHeading({
  children,
  count,
  action,
  className,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2.5 flex items-baseline gap-2", className)}>
      <h2 className="text-base font-bold text-ink">{children}</h2>
      {count != null && (
        <span className="text-sm tabular-nums text-ink-tertiary">{count}</span>
      )}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}
