import { Skeleton } from "@/components/ui/Skeleton";

/** The /t/[tid] overview's geometry as placeholders: hero, register CTA, the
 *  tile grid, the venue/timeline card. Shown while the tournament row loads —
 *  and again on competition day while the overview waits to find out whether
 *  it is about to hand off to the pairing board, so that hand-off reads as the
 *  page still loading rather than as a page that loaded and then jumped.
 *
 *  Chrome (the header) is the caller's: the provider renders its own while
 *  loading, and inside the subtree one is already up. */
export function OverviewSkeleton() {
  return (
    <main aria-busy="true" className="mx-auto max-w-app px-4 pb-dock pt-3">
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-[52px] rounded-2xl" />
        <div className="grid grid-cols-2 gap-2.5">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-14 rounded-2xl" />
        </div>
        <Skeleton className="h-44 rounded-3xl" />
      </div>
    </main>
  );
}
