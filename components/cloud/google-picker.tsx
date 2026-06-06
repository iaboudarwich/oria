"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

// Minimal shapes for the parts of the Google Picker SDK we touch. The SDK is
// loaded at runtime from apis.google.com; we cast through unknown rather than
// pull in @types/gapi just for this surface.
type PickerDoc = {
  id: string;
  name: string;
  mimeType: string;
  url?: string;
  iconUrl?: string;
  sizeBytes?: number;
};
type PickerResponse = { action: string; docs?: PickerDoc[] };
type GoogleNS = {
  picker: {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new (viewId?: unknown) => DocsView;
    ViewId: { DOCS: unknown; FOLDERS: unknown };
    Action: { PICKED: string };
    Feature: { MULTISELECT_ENABLED: unknown; SUPPORT_DRIVES: unknown };
  };
};
type DocsView = {
  setIncludeFolders: (v: boolean) => DocsView;
  setSelectFolderEnabled: (v: boolean) => DocsView;
  setMimeTypes: (v: string) => DocsView;
};
type PickerBuilder = {
  addView: (v: unknown) => PickerBuilder;
  enableFeature: (f: unknown) => PickerBuilder;
  setOAuthToken: (t: string) => PickerBuilder;
  setDeveloperKey: (k: string) => PickerBuilder;
  setAppId: (a: string) => PickerBuilder;
  setCallback: (cb: (r: PickerResponse) => void) => PickerBuilder;
  build: () => { setVisible: (v: boolean) => void };
};

declare global {
  interface Window {
    gapi?: { load: (m: string, cb: () => void) => void };
    google?: GoogleNS;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script load failed"));
    document.head.appendChild(s);
  });
}

async function ensurePicker(): Promise<void> {
  await loadScript("https://apis.google.com/js/api.js");
  await new Promise<void>((resolve) => {
    if (window.google?.picker) return resolve();
    window.gapi?.load("picker", () => resolve());
  });
}

type Props = {
  organizationId: string;
  sectionKey: string;
  label: string;
  connectDriveLabel: string;
  unavailableLabel: string;
  /** When true, allow folder selection (for periodic folder sync). */
  allowFolders?: boolean;
};

/**
 * "Link Google files" button. Opens the Google Picker (drive.file scope, so the
 * user explicitly chooses what Oria can see), then POSTs the references to the
 * link endpoint. Oria never downloads or stores content here.
 */
export function GooglePicker({
  organizationId,
  sectionKey,
  label,
  connectDriveLabel,
  unavailableLabel,
  allowFolders = true,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (connectionId: string, docs: PickerDoc[]) => {
      setBusy(true);
      try {
        await fetch("/api/cloud-files/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            sectionKey,
            connectionId,
            files: docs.map((d) => ({
              id: d.id,
              name: d.name,
              mimeType: d.mimeType,
              url: d.url ?? null,
              iconUrl: d.iconUrl ?? null,
              sizeBytes: d.sizeBytes ?? null,
            })),
          }),
        });
        router.refresh();
      } finally {
        setBusy(false);
      }
    },
    [organizationId, sectionKey, router],
  );

  const open = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/cloud-files/picker-token");
      if (res.status === 409) {
        setError("connect_drive");
        return;
      }
      if (!res.ok) {
        setError("unavailable");
        return;
      }
      const cfg = (await res.json()) as {
        accessToken: string;
        connectionId: string;
        developerKey: string;
        appId: string;
      };
      if (!cfg.developerKey || !cfg.appId) {
        setError("unavailable");
        return;
      }

      await ensurePicker();
      const g = window.google;
      if (!g) {
        setError("unavailable");
        return;
      }

      const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
        .setIncludeFolders(allowFolders)
        .setSelectFolderEnabled(allowFolders);

      const picker = new g.picker.PickerBuilder()
        .addView(view)
        .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(cfg.accessToken)
        .setDeveloperKey(cfg.developerKey)
        .setAppId(cfg.appId)
        .setCallback((r: PickerResponse) => {
          if (r.action === g.picker.Action.PICKED && r.docs?.length) {
            void submit(cfg.connectionId, r.docs);
          }
        })
        .build();
      picker.setVisible(true);
    } catch {
      setError("unavailable");
    } finally {
      setBusy(false);
    }
  }, [allowFolders, submit]);

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="transition-base inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 text-[12.5px] text-ink hover:bg-canvas disabled:opacity-60"
      >
        {busy ? "…" : label}
      </button>
      {error === "connect_drive" ? (
        <a
          href="/api/oauth/google/connect?service=drive"
          className="text-[11.5px] text-accent hover:underline"
        >
          {connectDriveLabel}
        </a>
      ) : error === "unavailable" ? (
        <span className="text-[11.5px] text-ink-faint">{unavailableLabel}</span>
      ) : null}
    </div>
  );
}
