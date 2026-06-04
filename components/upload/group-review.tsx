"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { sectionLabel } from "@/lib/sections-meta";
import { Button } from "@/components/ui/button";
import {
  confirmUploadGroup,
  splitUploadGroup,
  mergeUploadGroup,
} from "@/lib/data/upload-group-actions";
import type { GroupReview } from "@/lib/data/upload-groups";
import type { Section } from "@/lib/supabase/types";

/**
 * The group-review strip. When a multi-image drop is read as one set, Oria shows
 * the call here so the user can confirm it or flip it: a merged group can be
 * Kept separate, a split group can be Combined into one. The correction is
 * bidirectional, which is the whole point: the model's one-vs-many guess is a
 * default the user can always override.
 */
export function GroupReviewStrip({ groups }: { groups: GroupReview[] }) {
  const t = useTranslations("groupReview");
  const [done, setDone] = useState<Set<string>>(new Set());
  const visible = groups.filter((g) => !done.has(g.groupId));
  if (visible.length === 0) return null;

  return (
    <section aria-label={t("eyebrow")}>
      <h2 className="mb-2 px-1 text-eyebrow">{t("eyebrow")}</h2>
      <ul className="space-y-2">
        {visible.map((g) => (
          <GroupCard
            key={g.groupId}
            group={g}
            onResolved={() => setDone((prev) => new Set(prev).add(g.groupId))}
          />
        ))}
      </ul>
    </section>
  );
}

function GroupCard({
  group,
  onResolved,
}: {
  group: GroupReview;
  onResolved: () => void;
}) {
  const t = useTranslations("groupReview");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isMerged = group.status === "merged";

  const summary = isMerged
    ? t("merged_summary", { count: group.images.length })
    : t("split_summary", { count: group.images.length, records: group.records.length });

  function run(action: () => Promise<{ ok: boolean }>) {
    // Optimistically drop the card; refresh pulls the corrected state.
    onResolved();
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <li className="rounded-2xl border border-line bg-surface-raised p-3" aria-busy={pending}>
      {/* Member thumbnails, read as one set. */}
      <ul className="flex flex-wrap gap-1.5">
        {group.images.map((im, i) =>
          im.thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={im.uploadId}
              src={im.thumbUrl}
              alt={t("image_alt", { index: i + 1, count: group.images.length })}
              className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover"
            />
          ) : (
            <span
              key={im.uploadId}
              aria-label={t("image_alt", { index: i + 1, count: group.images.length })}
              className="h-12 w-12 shrink-0 rounded-lg border border-line bg-canvas"
            />
          ),
        )}
      </ul>

      <p className="mt-2.5 text-[13px] text-ink">{summary}</p>
      <ul className="mt-0.5 space-y-0.5">
        {group.records.map((r) => (
          <li key={r.id} className="truncate text-[11.5px] text-ink-faint">
            {r.title}
            {r.section ? ` · ${sectionLabel(r.section as Section)}` : ""}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={() => run(() => confirmUploadGroup(group.groupId))}
        >
          {t("confirm")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            run(() =>
              isMerged ? splitUploadGroup(group.groupId) : mergeUploadGroup(group.groupId),
            )
          }
        >
          {pending ? t("working") : isMerged ? t("split") : t("merge")}
        </Button>
      </div>
    </li>
  );
}
