import { Skeleton, SkeletonRing } from "@/components/ui/skeleton";
import { Stack, Grid, Cluster } from "@/components/ui/layout";

/**
 * Layout-MIRRORING skeletons (Round: perceived performance, Part 1). Each one
 * matches the real surface's structure (topbar, tile grid, dial rings, card
 * rows) so when data arrives there is zero layout shift. Built from the `.skeleton`
 * shimmer (token-based: surface base + line tint), which the global
 * prefers-reduced-motion rule freezes to a static placeholder automatically.
 * Rendered ONLY by route loading.tsx (Next Suspense = first load / cache-miss),
 * never on background revalidation.
 */

function TopbarSkeleton() {
  return (
    <div className="-mx-4 mb-6 border-b border-line bg-canvas/85 px-4 pt-5 pb-3 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <Skeleton className="h-3 w-28 rounded-md" />
      <Skeleton className="mt-2 h-7 w-56 rounded-lg" />
      <Skeleton className="mt-2 h-3.5 w-72 rounded-md" />
    </div>
  );
}

/** One metric tile: a dial ring beside two stacked label lines. */
function DialTileSkeleton({ ring = 78 }: { ring?: number }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
      <Skeleton className="h-3 w-20 rounded-md" />
      <div className="mt-3 flex items-center gap-4">
        <SkeletonRing size={ring} />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-3.5 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/** Today: greeting topbar, capture bar, space chips, the "Your day" tile grid
 *  (two dial tiles + a small row + wide rows), then the briefing. */
export function TodaySkeleton() {
  return (
    <>
      <TopbarSkeleton />
      <Stack gap={6}>
        <Skeleton className="h-14 w-full rounded-card" />
        <Cluster gap={2}>
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </Cluster>
        <Stack gap={3}>
          <Skeleton className="h-3 w-20 rounded-md" />
          <Grid gap={3} cols={2}>
            <DialTileSkeleton />
            <DialTileSkeleton ring={60} />
          </Grid>
          <Skeleton className="h-16 w-full rounded-card" />
          <Skeleton className="h-16 w-full rounded-tile" />
        </Stack>
        <Skeleton className="h-28 w-full rounded-card" />
      </Stack>
    </>
  );
}

/** Health: topbar, the tab row, the big metric dial card + contributors + trend. */
export function HealthSkeleton() {
  return (
    <>
      <TopbarSkeleton />
      <Stack gap={5}>
        <Cluster gap={2}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </Cluster>
        <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
          <div className="flex items-center gap-5">
            <SkeletonRing size={108} />
            <div className="space-y-2">
              <Skeleton className="h-3 w-20 rounded-md" />
              <Skeleton className="h-5 w-28 rounded-md" />
            </div>
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <Skeleton className="h-3.5 w-40 rounded-md" />
          </div>
          <div className="mt-3 flex items-end gap-2 border-t border-line pt-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-md"
                style={{ height: `${30 + ((i * 13) % 50)}px` }}
              />
            ))}
          </div>
        </div>
      </Stack>
    </>
  );
}

/** Finance / Bills: topbar, capture rows, the summary + spend visuals stack. */
export function FinanceSkeleton() {
  return (
    <>
      <TopbarSkeleton />
      <Stack gap={6}>
        <Skeleton className="h-20 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
        <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
          <Skeleton className="h-3 w-28 rounded-md" />
          <div className="mt-3 flex items-end gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-md"
                style={{ height: `${24 + ((i * 17) % 56)}px` }}
              />
            ))}
          </div>
        </div>
        <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
          <Stack gap={3}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3.5 w-24 rounded-md" />
                  <Skeleton className="h-3.5 w-14 rounded-md" />
                </div>
                <Skeleton
                  className="mt-1.5 h-2 rounded-full"
                  style={{ width: `${80 - i * 14}%` }}
                />
              </div>
            ))}
          </Stack>
        </div>
      </Stack>
    </>
  );
}

/** Uploads / inbox: topbar then a list of upload rows. */
export function UploadsSkeleton() {
  return (
    <>
      <TopbarSkeleton />
      <Stack gap={3}>
        <Skeleton className="h-20 w-full rounded-card" />
        <div className="divide-y divide-line rounded-card border border-line bg-surface">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 rounded-md" style={{ width: `${55 + (i % 3) * 15}%` }} />
                <Skeleton className="h-3 w-24 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </Stack>
    </>
  );
}

/** Ask: a reading column with a couple of message blocks + the composer. */
export function AskSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Stack gap={5}>
        <Skeleton className="h-7 w-48 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="ms-auto h-10 w-2/3 rounded-2xl" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-11/12 rounded-md" />
          <Skeleton className="h-3.5 w-4/5 rounded-md" />
          <Skeleton className="h-3.5 w-3/5 rounded-md" />
        </div>
        <Skeleton className="h-14 w-full rounded-card" />
      </Stack>
    </div>
  );
}
