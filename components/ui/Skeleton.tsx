import { cn } from "@/lib/utils";

/** Shimmering placeholder block (see .skeleton in globals.css). Size it with
 *  className; it is decoration — always aria-hidden, with the surrounding
 *  container marked aria-busy while real content loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

/** Generic list placeholder for admin tables/worklists: a stack of row-shaped
 *  blocks. Same contract as Skeleton — aria-hidden decoration inside an
 *  aria-busy container. */
export function SkeletonRows({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-20 rounded-3xl", className)} />
      ))}
    </div>
  );
}

/** Placeholder for one home-list tournament row: the tile, the name line with
 *  its pill, and the meta line — at the row's real height so the list doesn't
 *  jump when the data lands. Same contract as Skeleton — aria-hidden
 *  decoration inside an aria-busy container. */
export function SkeletonTournamentRow() {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5"
    >
      <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-[22px] w-20 shrink-0 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-4/5" />
      </div>
    </div>
  );
}
