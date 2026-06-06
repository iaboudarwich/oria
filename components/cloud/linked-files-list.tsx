"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GooglePicker } from "./google-picker";
import { MicrosoftPicker, type MicrosoftPickerLabels } from "./microsoft-picker";

export type LinkedFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
  iconLink: string | null;
  modifiedTime: string | null;
  isFolder: boolean;
  accessible: boolean;
  provider: "google" | "microsoft";
};

export type LinkedFilesLabels = {
  heading: string;
  link: string;
  connectDrive: string;
  unavailable: string;
  openInDrive: string;
  openInOneDrive: string;
  remove: string;
  inaccessible: string;
  empty: string;
  view: string;
  onedriveLink: string;
  ms: MicrosoftPickerLabels;
};

/**
 * Linked cloud files for one section: a list with the Drive and/or OneDrive
 * picker to add more. Remove unlinks the reference (the file itself is
 * untouched). View fetches content on demand.
 */
export function LinkedFilesList({
  organizationId,
  sectionKey,
  files,
  labels,
  onedriveConnectionId,
}: {
  organizationId: string;
  sectionKey: string;
  files: LinkedFile[];
  labels: LinkedFilesLabels;
  onedriveConnectionId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ name: string; text: string } | null>(null);
  const [loadingView, setLoadingView] = useState<string | null>(null);

  async function remove(id: string) {
    setRemoving(id);
    try {
      await fetch(`/api/cloud-files/${id}`, { method: "DELETE" });
      startTransition(() => router.refresh());
    } finally {
      setRemoving(null);
    }
  }

  async function view(id: string, name: string) {
    setLoadingView(id);
    try {
      const res = await fetch(`/api/cloud-files/${id}/content`);
      if (res.status === 410) {
        setViewing({ name, text: labels.inaccessible });
        startTransition(() => router.refresh());
        return;
      }
      if (!res.ok) {
        setViewing({ name, text: labels.unavailable });
        return;
      }
      const data = (await res.json()) as { text: string };
      setViewing({ name, text: data.text || "" });
    } finally {
      setLoadingView(null);
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-line bg-surface-raised p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-semibold tracking-[0.05em] text-ink-faint uppercase">
            {labels.heading}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <GooglePicker
              organizationId={organizationId}
              sectionKey={sectionKey}
              label={labels.link}
              connectDriveLabel={labels.connectDrive}
              unavailableLabel={labels.unavailable}
            />
            {onedriveConnectionId ? (
              <MicrosoftPicker
                organizationId={organizationId}
                sectionKey={sectionKey}
                connectionId={onedriveConnectionId}
                label={labels.onedriveLink}
                labels={labels.ms}
              />
            ) : null}
          </div>
        </div>

        {files.length === 0 ? (
          <p className="text-[12.5px] text-ink-faint">{labels.empty}</p>
        ) : (
          <ul className="space-y-0.5">
            {files.map((f) => (
              <li
                key={f.id}
                className="group transition-base flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-canvas"
              >
                {f.iconLink ? (
                  // Google's icon CDN URLs are tiny static badges; next/image
                  // would add no value and cannot know these remote hosts.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.iconLink} alt="" width={16} height={16} className="shrink-0" />
                ) : (
                  <span className="shrink-0 text-ink-faint">{f.isFolder ? "📁" : "📄"}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{f.name}</p>
                  {!f.accessible ? (
                    <p className="truncate text-[11px] text-danger">{labels.inaccessible}</p>
                  ) : f.modifiedTime ? (
                    <p className="truncate text-[11px] text-ink-faint">
                      {new Date(f.modifiedTime).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  ) : null}
                </div>
                {f.accessible && !f.isFolder ? (
                  <button
                    type="button"
                    onClick={() => view(f.id, f.name)}
                    disabled={loadingView === f.id}
                    className="shrink-0 text-[11.5px] text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink disabled:opacity-40"
                  >
                    {loadingView === f.id ? "…" : labels.view}
                  </button>
                ) : null}
                {f.webViewLink ? (
                  <a
                    href={f.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-[11.5px] text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
                  >
                    {f.provider === "microsoft" ? labels.openInOneDrive : labels.openInDrive}
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(f.id)}
                  disabled={pending || removing === f.id}
                  className="shrink-0 text-[11.5px] text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger disabled:opacity-40"
                >
                  {labels.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {viewing ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setViewing(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="truncate text-[14px] font-medium text-ink">{viewing.name}</p>
              <button
                type="button"
                onClick={() => setViewing(null)}
                className="shrink-0 text-[13px] text-ink-faint hover:text-ink"
              >
                ✕
              </button>
            </div>
            <pre className="overflow-auto px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-muted">
              {viewing.text || labels.empty}
            </pre>
          </div>
        </div>
      ) : null}
    </>
  );
}
