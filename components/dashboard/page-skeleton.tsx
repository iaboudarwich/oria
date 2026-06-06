/**
 * Quiet loading placeholder used by every dashboard loading.tsx. The
 * sidebar stays mounted (it's in the layout); only the page area
 * renders this while the next segment fetches. Keeping it visually
 * close to the real pages avoids the "flash of skeleton" feeling.
 * the eye sees structure, not motion.
 */
export function PageSkeleton({
  showTopbar = true,
  rows = 5,
}: {
  showTopbar?: boolean;
  rows?: number;
}) {
  return (
    <div className="animate-pulse">
      {showTopbar ? (
        <div className="mb-6 flex items-center gap-3">
          <div className="h-7 w-40 rounded-md bg-canvas" />
        </div>
      ) : null}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-14 rounded-2xl border border-line bg-surface-raised" />
        ))}
      </div>
    </div>
  );
}
