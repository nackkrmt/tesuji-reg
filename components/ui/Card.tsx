import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div id={id} className={cn("glass-card rounded-3xl", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "text-xs font-semibold uppercase tracking-wider text-white/40",
        className,
      )}
    >
      {children}
    </h2>
  );
}
