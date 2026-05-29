"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { linkUploadToEntity } from "@/lib/data/entity-actions";
import type { Entity, EntityType } from "@/lib/data/entities";

export function EntityLinkPanel({
  uploadId,
  linkedEntities,
  availableEntities,
}: {
  uploadId: string;
  linkedEntities: Array<{ entity: Entity; entityType: EntityType; relationship: string }>;
  availableEntities: Array<{ entity: Entity; entityType: EntityType }>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [rel, setRel] = useState("document");
  const [pending, startTransition] = useTransition();

  function handleLink() {
    if (!selectedId || pending) return;
    startTransition(async () => {
      await linkUploadToEntity(selectedId, uploadId, rel);
      setShowPicker(false);
      setSelectedId("");
    });
  }

  if (linkedEntities.length === 0 && availableEntities.length === 0) return null;

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
          Linked to
        </h2>
        {availableEntities.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="text-[11px] text-ink-faint hover:text-ink transition-base"
          >
            {showPicker ? "Cancel" : "Link thing"}
          </button>
        )}
      </div>

      {linkedEntities.length > 0 && (
        <ul className="space-y-1 mb-2">
          {linkedEntities.map(({ entity, entityType, relationship }) => (
            <li
              key={entity.id}
              className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/things/${entity.id}`}
                  className="block truncate text-[13px] text-ink hover:underline"
                >
                  {entity.name}
                </Link>
                <span className="text-[10.5px] text-ink-faint">
                  {entityType.label_singular} · {relationship}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showPicker && (
        <div className="rounded-xl border border-line bg-canvas p-3 space-y-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="block h-9 w-full rounded-lg border border-line bg-surface-raised px-2.5 text-[13px] text-ink outline-none focus:border-ink"
          >
            <option value="">Choose thing...</option>
            {availableEntities.map(({ entity, entityType }) => (
              <option key={entity.id} value={entity.id}>
                {entity.name} ({entityType.label_singular})
              </option>
            ))}
          </select>
          <select
            value={rel}
            onChange={(e) => setRel(e.target.value)}
            className="block h-9 w-full rounded-lg border border-line bg-surface-raised px-2.5 text-[13px] text-ink outline-none focus:border-ink"
          >
            <option value="document">Document</option>
            <option value="photo">Photo</option>
            <option value="insurance">Insurance</option>
            <option value="other">Other</option>
          </select>
          <button
            type="button"
            onClick={handleLink}
            disabled={!selectedId || pending}
            className="inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft disabled:opacity-50 transition-base"
          >
            {pending ? "Linking..." : "Link"}
          </button>
        </div>
      )}
    </section>
  );
}
