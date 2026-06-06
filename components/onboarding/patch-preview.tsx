"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PlanPatch } from "@/lib/onboarding/types";
import { patchIsEmpty } from "@/lib/onboarding/types";

/**
 * Renders a reshape PlanPatch as a reviewable preview: green CREATE rows, yellow
 * RENAME rows (old -> new), red DELETE rows (with item count). DELETE requires a
 * second confirmation. The confirm button label adapts to the patch contents.
 * Shared by the reshape page and the Ask Oria inline route.
 */
export function PatchPreview({
  patch,
  building,
  onConfirm,
  onCancel,
}: {
  patch: PlanPatch;
  building?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("reshape");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (patchIsEmpty(patch)) {
    return (
      <div>
        <p className="text-[14px] text-ink-soft">{t("nothing")}</p>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="transition-base mt-3 rounded-xl border border-line-strong px-4 py-2 text-[13px] font-medium text-ink hover:bg-surface"
          >
            {t("try_again")}
          </button>
        ) : null}
      </div>
    );
  }

  const hasDeletes = patch.deletes.length > 0;
  const createCount = patch.creates.length + patch.section_adds.length;
  const confirmLabel = hasDeletes
    ? t("confirm_delete")
    : createCount > 0 && patch.renames.length > 0
      ? t("confirm_mixed")
      : patch.renames.length > 0 && createCount === 0
        ? t("confirm_apply")
        : t("confirm_create");

  const totalArchived = patch.deletes.reduce((n, d) => n + (d.itemCount ?? 0), 0);

  function handleConfirm() {
    if (hasDeletes && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onConfirm();
  }

  return (
    <div>
      <p className="text-[12.5px] font-medium text-ink-muted">{t("will_change")}</p>
      <div className="mt-2 space-y-2">
        {patch.creates.map((w, i) => (
          <div key={`c-${i}`} className="rounded-2xl border border-sage/40 bg-sage/5 p-4">
            <p className="text-[14px] font-semibold text-ink">
              {t("row_create")}: {w.name}
            </p>
            {w.sections.length ? (
              <p className="mt-1 text-[12.5px] text-ink-muted">
                {w.sections.map((s) => s.title).join(", ")}
              </p>
            ) : null}
          </div>
        ))}
        {patch.section_adds.map((a, i) => (
          <div key={`sa-${i}`} className="rounded-2xl border border-sage/40 bg-sage/5 p-4">
            <p className="text-[14px] font-semibold text-ink">
              {t("row_create")}: {a.section.title}
            </p>
          </div>
        ))}
        {patch.renames.map((r, i) => (
          <div key={`r-${i}`} className="rounded-2xl border border-accent/40 bg-accent-soft/20 p-4">
            <p className="text-[14px] font-semibold text-ink">
              {t("row_rename")}: {r.from} {"->"} {r.to}
            </p>
          </div>
        ))}
        {patch.deletes.map((d, i) => (
          <div key={`d-${i}`} className="rounded-2xl border border-claret/40 bg-claret/5 p-4">
            <p className="text-[14px] font-semibold text-ink">
              {t("row_delete")}: {d.name}
            </p>
            {d.itemCount && d.itemCount > 0 ? (
              <p className="mt-1 text-[12px] text-claret">
                {t("items_archived", { count: d.itemCount })}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={building}
        className={`transition-base mt-5 w-full rounded-xl px-5 py-3 text-[15px] font-medium text-surface disabled:opacity-50 ${
          hasDeletes ? "bg-claret hover:opacity-90" : "bg-ink hover:bg-ink-soft"
        }`}
      >
        {building ? t("building") : confirmLabel}
      </button>

      {confirmDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-ink">{t("delete_confirm_title")}</h3>
            <p className="mt-1 text-[13px] text-ink-muted">
              {t("delete_confirm_body", { count: totalArchived })}
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-3 py-1.5 text-[12.5px] text-ink-muted hover:text-ink"
              >
                {t("delete_confirm_cancel")}
              </button>
              <button
                type="button"
                disabled={building}
                onClick={() => {
                  setConfirmDelete(false);
                  onConfirm();
                }}
                className="transition-base rounded-lg bg-claret px-3 py-1.5 text-[12.5px] font-medium text-surface hover:opacity-90 disabled:opacity-50"
              >
                {t("delete_confirm_go")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
