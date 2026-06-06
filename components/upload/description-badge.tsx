import { SparkIcon } from "@/components/ui/icon";

type Props = {
  metadata: unknown;
};

/**
 * Surfaces the short note the user typed when uploading. The point is
 * twofold: confirm what they wrote was captured, and quietly hint that
 * Oria uses it when answering questions. Nothing renders if no note exists.
 */
export function DescriptionBadge({ metadata }: Props) {
  const note = readUserDescription(metadata);
  if (!note) return null;
  return (
    <section>
      <h2 className="text-eyebrow mb-2 px-1">Your note</h2>
      <div className="rounded-2xl border border-line bg-surface-raised p-4">
        <p className="text-[13px] text-ink">&ldquo;{note}&rdquo;</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          <SparkIcon size={11} />
          Oria uses this when answering.
        </p>
      </div>
    </section>
  );
}

function readUserDescription(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as { user_description?: unknown }).user_description;
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}
