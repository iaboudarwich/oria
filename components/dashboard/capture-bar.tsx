"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { MicButton } from "@/components/ui/mic-button";
import { PaperclipIcon, SendIcon } from "@/components/ui/icon";
import { uploadFile } from "@/lib/data/upload-actions";
import { confirmPaste } from "@/lib/data/paste-actions";
import type { Locale } from "@/i18n/config";

type Offer = {
  offer: true;
  section: string;
  sectionLabel: string;
  documentType: string | null;
  title: string;
};

type FileState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "done" }
  | { kind: "error"; message: string };

/**
 * The ONE home capture entry (Round: home redesign). A single premium bar that
 * takes everything the four old separate surfaces did, wired to the existing
 * pipelines, not a rebuild:
 *   - TYPE a question + send  -> Ask Oria (handed off via /dashboard/ask?q=).
 *   - PASTE a block (>=120ch) -> the smart-paste classifier offers to file it
 *     in the right section (confirmPaste), same flow as the old SmartPaste.
 *   - DROP or ATTACH files    -> the upload pipeline (uploadFile), per file.
 *   - VOICE (mic)             -> Whisper transcription dropped into the field.
 *
 * Multi-image GROUPING still lives on the Uploads tab dropzone; the home bar
 * uploads each dropped file on its own, which is the right default for a quick
 * single capture. Nothing here bypasses RLS or write-back; it only composes
 * actions that already enforce it.
 */
export function CaptureBar() {
  const t = useTranslations("captureBar");
  const tp = useTranslations("smartPaste");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  const [text, setText] = useState("");
  const [offer, setOffer] = useState<Offer | null>(null);
  const [checking, setChecking] = useState(false);
  const [filed, setFiled] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<FileState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  async function classify(value: string) {
    if (value.trim().length < 120) {
      setOffer(null);
      return;
    }
    const mine = ++reqId.current;
    setChecking(true);
    try {
      const res = await fetch("/api/paste/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = (await res.json()) as Offer | { offer: false };
      if (mine !== reqId.current) return;
      setOffer(data.offer ? (data as Offer) : null);
    } catch {
      if (mine === reqId.current) setOffer(null);
    } finally {
      if (mine === reqId.current) setChecking(false);
    }
  }

  function addPaste() {
    if (!offer) return;
    const timezone =
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
    const nowISO = new Date().toISOString();
    const confirmation = tp("filed", { section: offer.sectionLabel });
    startTransition(async () => {
      const res = await confirmPaste({ text: text.trim(), section: offer.section, timezone, nowISO });
      if (res.ok) {
        setFiled(confirmation);
        setOffer(null);
        setText("");
        router.refresh();
      }
    });
  }

  // Typed text (not a long paste with a pending offer) -> Ask Oria.
  function submit() {
    if (offer) return; // the paste offer takes precedence over an ask
    const q = text.trim();
    if (!q) return;
    router.push(`/dashboard/ask?q=${encodeURIComponent(q)}`);
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setFile({ kind: "uploading" });
    let ok = true;
    for (const f of list) {
      const fd = new FormData();
      fd.append("file", f);
      const res = await uploadFile(fd);
      if (!res.ok) ok = false;
    }
    if (ok) {
      setFile({ kind: "done" });
      router.refresh();
      window.setTimeout(() => setFile({ kind: "idle" }), 2500);
    } else {
      setFile({ kind: "error", message: t("failed") });
    }
  }

  return (
    <section
      aria-label={t("placeholder")}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
      }}
      className={`relative rounded-card border bg-surface p-2 shadow-soft transition-base ${
        drag ? "border-brand" : "border-line"
      }`}
    >
      <div className="flex items-end gap-1.5">
        <AutoGrowTextarea
          value={text}
          onChange={(v) => {
            setText(v);
            setFiled(null);
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            window.setTimeout(() => {
              const el = e.target as HTMLTextAreaElement;
              void classify(el.value || pasted);
            }, 0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t("placeholder")}
          minRows={1}
          maxRows={6}
          aria-label={t("placeholder")}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-[14px] text-ink placeholder:text-ink-faint outline-none"
        />

        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label={t("attach")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-3 text-ink-muted transition-base hover:text-ink"
        >
          <PaperclipIcon size={17} />
        </button>
        <MicButton
          size="md"
          onTranscribed={(tx) => setText((p) => (p ? `${p} ${tx}` : tx))}
          targetLanguage={locale}
        />
        <button
          type="button"
          onClick={submit}
          aria-label={t("send")}
          disabled={!text.trim() || !!offer}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-accent-ink transition-base disabled:opacity-40"
        >
          <SendIcon size={17} />
        </button>
      </div>

      {checking ? (
        <p className="px-2 pt-1.5 text-[11.5px] text-ink-faint">{tp("reading")}</p>
      ) : null}

      {offer && !checking ? (
        <div className="mx-1 mt-1.5 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft/40 px-3 py-2">
          <p className="flex-1 text-[12.5px] text-ink-soft">
            {offer.documentType
              ? tp("offer_typed", { type: offer.documentType, section: offer.sectionLabel })
              : tp("offer", { section: offer.sectionLabel })}
          </p>
          <button
            type="button"
            onClick={addPaste}
            disabled={pending}
            className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-medium text-accent-ink transition-base disabled:opacity-50"
          >
            {tp("add", { section: offer.sectionLabel })}
          </button>
          <button
            type="button"
            onClick={() => setOffer(null)}
            className="text-[12px] text-ink-muted transition-base hover:text-ink"
          >
            {tp("dismiss")}
          </button>
        </div>
      ) : null}

      {file.kind === "uploading" ? (
        <p className="px-2 pt-1.5 text-[12px] text-ink-muted">{t("adding")}</p>
      ) : file.kind === "done" ? (
        <p className="px-2 pt-1.5 text-[12px] text-ink-muted">{t("added")}</p>
      ) : file.kind === "error" ? (
        <p className="px-2 pt-1.5 text-[12px] text-down">{file.message}</p>
      ) : null}

      {filed ? <p className="px-2 pt-1.5 text-[12px] text-ink-muted">{filed}</p> : null}

      {drag ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-card border-2 border-dashed border-brand bg-surface/85 text-[13px] font-medium text-ink">
          {t("drop_here")}
        </div>
      ) : null}
    </section>
  );
}
