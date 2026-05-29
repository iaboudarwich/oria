import type { CSSProperties } from "react";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={style}
      aria-hidden
    />
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 rounded-md" style={{ width: `${60 + (i % 3) * 15}%` }} />
            <Skeleton className="h-3 rounded-md" style={{ width: `${40 + (i % 2) * 20}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-line bg-surface-raised p-4 space-y-3">
      <Skeleton className="h-5 rounded-lg" style={{ width: "60%" }} />
      <Skeleton className="h-3.5 rounded-md" style={{ width: "80%" }} />
      <Skeleton className="h-3.5 rounded-md" style={{ width: "50%" }} />
    </div>
  );
}
