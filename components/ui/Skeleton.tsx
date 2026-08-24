import { cn } from "@/lib/utils";

/** Shimmering placeholder block (see .skeleton in globals.css). Size it with
 *  className; it is decoration — always aria-hidden, with the surrounding
 *  container marked aria-busy while real content loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton", className)} />;
}

/** The tournament-card-shaped skeleton shared by the home list and the
 *  results hub: a media block plus two text lines, matching TournamentCard's
 *  geometry so content doesn't jump when it lands. */
export function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"
    >
      <div className="skeleton h-28 rounded-none" />
      <div className="space-y-2.5 p-4">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
    </div>
  );
}
