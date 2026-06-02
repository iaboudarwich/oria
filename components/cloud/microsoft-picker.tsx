"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type OneDriveItem = {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType: string | null;
  webUrl: string | null;
  size: number | null;
};

export type MicrosoftPickerLabels = {
  link: string;
  home: string;
  select: string;
  cancel: string;
  loading: string;
  empty: string;
  error: string;
};

/**
 * Custom OneDrive picker (no external SDK). Browses folders via the server
 * /api/onedrive/browse proxy (token stays server-side), lets the user multi-
 * select files, and links the references. Mirrors the Drive linking UX.
 */
export function MicrosoftPicker({
  organizationId,
  sectionKey,
  connectionId,
  label,
  labels,
}: {
  organizationId: string;
  sectionKey: string;
  connectionId: string;
  label: string;
  labels: MicrosoftPickerLabels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<OneDriveItem[]>([]);
  const [crumbs, setCrumbs] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "" }]);
  const [selected, setSelected] = useState<Record<string, OneDriveItem>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (folderId: string | null) => {
    setLoading(true);
    setError(false);
    try {
      const qs = new URLSearchParams({ connectionId });
      if (folderId) qs.set("folderId", folderId);
      const res = await fetch(`/api/onedrive/browse?${qs.toString()}`);
      if (!res.ok) {
        setError(true);
        setItems([]);
        return;
      }
      const data = (await res.json()) as { items: OneDriveItem[] };
      setItems(data.items ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  function start() {
    setOpen(true);
    setSelected({});
    setCrumbs([{ id: null, name: labels.home }]);
    void load(null);
  }

  function enterFolder(it: OneDriveItem) {
    setCrumbs((c) => [...c, { id: it.id, name: it.name }]);
    void load(it.id);
  }

  function goToCrumb(idx: number) {
    const next = crumbs.slice(0, idx + 1);
    setCrumbs(next);
    void load(next[next.length - 1].id);
  }

  function toggle(it: OneDriveItem) {
    setSelected((prev) => {
      const copy = { ...prev };
      if (copy[it.id]) delete copy[it.id];
      else copy[it.id] = it;
      return copy;
    });
  }

  async function linkSelected() {
    const files = Object.values(selected);
    if (files.length === 0) return;
    setBusy(true);
    try {
      await fetch("/api/cloud-files/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          sectionKey,
          connectionId,
          files: files.map((f) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType ?? "application/octet-stream",
            url: f.webUrl,
            sizeBytes: f.size,
          })),
        }),
      });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = Object.keys(selected).length;

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 text-[12.5px] text-ink transition-base hover:bg-canvas"
      >
        {label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-4 py-3 text-[12.5px]">
              {crumbs.map((c, i) => (
                <span key={c.id ?? "root"} className="flex items-center gap-1">
                  {i > 0 ? <span className="text-ink-faint">/</span> : null}
                  <button
                    type="button"
                    onClick={() => goToCrumb(i)}
                    className="text-ink-muted hover:text-ink"
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </div>

            <div className="min-h-[200px] flex-1 overflow-auto p-2">
              {loading ? (
                <p className="px-2 py-3 text-[12.5px] text-ink-faint">{labels.loading}</p>
              ) : error ? (
                <p className="px-2 py-3 text-[12.5px] text-danger">{labels.error}</p>
              ) : items.length === 0 ? (
                <p className="px-2 py-3 text-[12.5px] text-ink-faint">{labels.empty}</p>
              ) : (
                <ul className="space-y-0.5">
                  {items.map((it) =>
                    it.isFolder ? (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => enterFolder(it)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink transition-base hover:bg-canvas"
                        >
                          <span aria-hidden>📁</span>
                          <span className="truncate">{it.name}</span>
                        </button>
                      </li>
                    ) : (
                      <li key={it.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink transition-base hover:bg-canvas">
                          <input
                            type="checkbox"
                            checked={!!selected[it.id]}
                            onChange={() => toggle(it)}
                          />
                          <span aria-hidden>📄</span>
                          <span className="truncate">{it.name}</span>
                        </label>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-1.5 text-[12.5px] text-ink-muted hover:text-ink"
              >
                {labels.cancel}
              </button>
              <button
                type="button"
                onClick={linkSelected}
                disabled={selectedCount === 0 || busy}
                className="rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface transition-base hover:bg-ink-soft disabled:opacity-50"
              >
                {labels.select}
                {selectedCount > 0 ? ` (${selectedCount})` : ""}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
