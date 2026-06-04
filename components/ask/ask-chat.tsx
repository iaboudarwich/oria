"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRightIcon, SparkIcon, PaperclipIcon, CloseIcon } from "@/components/ui/icon";
import { SourceCard, type SourceItem } from "./source-card";
import { MicButton } from "@/components/ui/mic-button";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { useLocale, useTranslations } from "next-intl";
import { PatchPreview } from "@/components/onboarding/patch-preview";
import { reshapeGeneratePatch, reshapeExecutePatch } from "@/app/dashboard/reshape/actions";
import { EMPTY_USER_CONTEXT, type PlanPatch } from "@/lib/onboarding/types";
import type { Locale } from "@/i18n/config";

/** One attached image, carried both for display (dataUrl) and for the request
 *  payload (mimeType + dataBase64). Kept on the turn so a retry/rerun resends. */
type Attachment = {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  dataBase64: string;
};

type Turn = {
  id: string;
  question: string;
  answer: string;
  sources: SourceItem[];
  /** Images attached to this question, shown as thumbnails on the turn. */
  images?: Attachment[];
  state: "streaming" | "done" | "error";
  errorCode?: string;
  errorMessage?: string;
  /** This turn was answered on the reasoning tier (deeper thinking). */
  usedReasoning?: boolean;
  /** The classifier offered deeper thinking for this question. */
  reasoningOffered?: boolean;
  /** Reasoning trace (Anthropic), for the "View reasoning" collapsible. */
  reasoning?: string;
  /** The query was detected as a setup request and rerouted to reshape. */
  setupIntent?: boolean;
  /** The rerouted query had an image attached (drives the handoff copy). */
  setupHadImage?: boolean;
  /** The generated reshape patch (null while generating). */
  patch?: PlanPatch | null;
  /** The reshape patch was applied. */
  setupApplied?: boolean;
};

export type ReasoningMode = "auto" | "manual" | "always" | "never";

/** Prior-turn shape sent back to /api/ask as conversation history.
 *  Defined locally. the server-side AgentMessage type can't be imported
 *  into a Client Component. */
type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "What flights do I have coming up?",
  "When did I last pay my electricity bill?",
  "Show me the last receipt from the grocery store.",
  "What is due this week?",
];

// Image attachment limits. Mirrored on the server (lib/ai/ask-images.ts), which
// is the real gate. these client checks just give instant, friendly feedback.
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPT_ATTR = ".png,.jpg,.jpeg,.webp,.gif,.heic,.heif,image/*";
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|heic|heif)$/i;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

function looksLikeImage(file: File): boolean {
  return file.type.startsWith("image/") || IMAGE_EXT.test(file.name);
}

function isAcceptedImage(file: File): boolean {
  if (ALLOWED_MIME.has(file.type.toLowerCase())) return true;
  // iOS sometimes hands over HEIC with an empty or octet-stream type.
  return file.type === "" || file.type === "application/octet-stream"
    ? IMAGE_EXT.test(file.name)
    : false;
}

/** Read a File into an Attachment (dataUrl for preview, base64 for the payload). */
function readAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const comma = dataUrl.indexOf(",");
      const dataBase64 = comma >= 0 ? dataUrl.slice(comma + 1) : "";
      const mimeType =
        file.type || (IMAGE_EXT.test(file.name) ? "image/heic" : "application/octet-stream");
      resolve({ id: crypto.randomUUID(), name: file.name, dataUrl, mimeType, dataBase64 });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Optional section scope. When set, the chat is restricted to one section:
 * retrieval and the agent both refuse cross-section answers, the empty-state
 * copy adapts, and the chat is visually framed as "Ask {section}".
 */
export type AskScope = {
  kind: "builtin" | "custom" | "smart";
  key: string;
  label: string;
};

type AskChatProps = {
  scope?: AskScope | null;
  /** Custom suggestion chips for the empty state. Defaults to general life
   *  prompts; section pages pass section-specific examples. */
  suggestions?: string[];
  /** When true, render the God's Eye toggle. The server only honours it
   *  when the active org is Personal. this prop is the visual gate, the
   *  data layer is the security gate. */
  crossSpaceAvailable?: boolean;
  /** Top recent unique questions the current user has asked in this
   *  org. Rendered as a separate row above the static suggestions so
   *  Oria offers the questions they actually return to. */
  recentQuestions?: string[];
  /** Name of the active space, shown in the scope control's description. */
  spaceName?: string | null;
  /** The user's reasoning preference (controls the offer + button). */
  reasoningMode?: ReasoningMode;
};

/**
 * Calm ChatGPT-style chat for Ask Oria. Single-page, no server-side history
 * persistence yet. turns live in client state. Streaming uses an NDJSON
 * protocol from /api/ask: each line is one event.
 */
export function AskChat({
  scope,
  suggestions,
  crossSpaceAvailable = false,
  recentQuestions = [],
  spaceName = null,
  reasoningMode = "auto",
}: AskChatProps = {}) {
  const tr = useTranslations("ask");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [crossSpace, setCrossSpace] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const effectiveSuggestions = suggestions ?? SUGGESTIONS;
  // Tracks the server-assigned conversation id once the first turn
  // completes. Sent in all subsequent requests so messages are grouped.
  const conversationIdRef = useRef<string | null>(null);

  // Pending image attachments for the next question, plus a transient notice
  // (over-limit / wrong format) and a full-size lightbox target.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentsRef = useRef<Attachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  const updateTurn = useCallback((id: string, fn: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  // Validate, cap, and read dropped/pasted/picked image files into attachments.
  const addFiles = useCallback(
    async (files: File[]) => {
      const candidates = files.filter(looksLikeImage);
      if (candidates.length === 0) return;
      let nextNotice: string | null = null;
      const valid: File[] = [];
      for (const f of candidates) {
        if (!isAcceptedImage(f)) {
          nextNotice = tr("image_unsupported");
          continue;
        }
        if (f.size > MAX_IMAGE_BYTES) {
          nextNotice = tr("image_too_large");
          continue;
        }
        valid.push(f);
      }
      const room = Math.max(0, MAX_IMAGES - attachmentsRef.current.length);
      if (valid.length > room) nextNotice = tr("image_too_many", { max: MAX_IMAGES });
      const read = await Promise.all(valid.slice(0, room).map(readAttachment));
      if (read.length > 0) {
        setAttachments((prev) => [...prev, ...read].slice(0, MAX_IMAGES));
      }
      setNotice(nextNotice);
    },
    [tr],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Open /api/ask and stream the NDJSON events into the turn `id`. Shared
  // by a fresh send and by Retry, so both follow the exact same protocol.
  const runStream = useCallback(
    async (
      id: string,
      query: string,
      history: ChatMessage[],
      reasoning = false,
      forceNormal = false,
      images: Attachment[] = [],
    ) => {
      setBusy(true);
      const effectiveReasoning = reasoning || reasoningMode === "always";
      if (effectiveReasoning) updateTurn(id, (t) => ({ ...t, usedReasoning: true }));
      // Track whether we saw a terminal frame. A stream that closes
      // without one (proxy drop, server crash mid-answer) would otherwise
      // leave the turn stuck on "Thinking…" forever. the hang we're
      // guarding against. We force it to an error so Retry appears.
      let settled = false;
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            history,
            scope: scope ?? null,
            crossSpace: crossSpaceAvailable && crossSpace,
            conversationId: conversationIdRef.current ?? null,
            reasoning: effectiveReasoning,
            forceNormal,
            images: images.map((a) => ({ mimeType: a.mimeType, dataBase64: a.dataBase64 })),
          }),
        });
        if (!res.ok || !res.body) {
          let friendly: string | undefined;
          try {
            const data = (await res.clone().json()) as { message?: string };
            if (typeof data?.message === "string") friendly = data.message;
          } catch {
            // body wasn't JSON, fall through to generic message
          }
          settled = true;
          updateTurn(id, (t) => ({
            ...t,
            state: "error",
            errorCode: `http_${res.status}`,
            errorMessage: friendly,
          }));
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line) as
                | { type: "sources"; sources: SourceItem[] }
                | { type: "delta"; text: string }
                | { type: "reasoning_offer" }
                | { type: "reasoning"; text: string }
                | { type: "setup_intent"; query: string; hasImage?: boolean }
                | { type: "done"; conversationId?: string | null }
                | { type: "error"; code: string };
              if (evt.type === "sources") {
                updateTurn(id, (t) => ({ ...t, sources: evt.sources }));
              } else if (evt.type === "setup_intent") {
                // Reroute to the reshape engine: generate the patch inline.
                const hadImage = evt.hasImage === true;
                updateTurn(id, (t) => ({ ...t, setupIntent: true, setupHadImage: hadImage, patch: null, state: "done" }));
                void reshapeGeneratePatch(EMPTY_USER_CONTEXT, evt.query).then((p) =>
                  updateTurn(id, (t) => ({ ...t, patch: p })),
                );
              } else if (evt.type === "reasoning_offer") {
                updateTurn(id, (t) => ({ ...t, reasoningOffered: true }));
              } else if (evt.type === "reasoning") {
                updateTurn(id, (t) => ({ ...t, reasoning: evt.text }));
              } else if (evt.type === "delta") {
                updateTurn(id, (t) => ({ ...t, answer: t.answer + evt.text }));
              } else if (evt.type === "done") {
                settled = true;
                // Capture server-assigned conversation id so follow-up
                // turns are appended to the same conversation.
                if (
                  evt.conversationId &&
                  !conversationIdRef.current
                ) {
                  conversationIdRef.current = evt.conversationId;
                }
                updateTurn(id, (t) => ({ ...t, state: "done" }));
              } else if (evt.type === "error") {
                settled = true;
                updateTurn(id, (t) => ({
                  ...t,
                  state: "error",
                  errorCode: evt.code,
                }));
              }
            } catch {
              // ignore malformed line
            }
          }
        }
        // Stream ended without a done/error frame. don't hang.
        if (!settled) {
          updateTurn(id, (t) =>
            t.state === "streaming"
              ? { ...t, state: "error", errorCode: "stream_incomplete" }
              : t,
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "stream_failed";
        updateTurn(id, (t) => ({ ...t, state: "error", errorCode: message }));
      } finally {
        setBusy(false);
      }
    },
    [updateTurn, scope, crossSpace, crossSpaceAvailable, reasoningMode],
  );

  const send = useCallback(
    async (question: string, reasoning = false) => {
      const trimmed = question.trim();
      const imgs = attachmentsRef.current;
      if ((!trimmed && imgs.length === 0) || busy) return;
      // An image with no typed question still gets a sensible default ask.
      const effectiveQuery = trimmed || tr("image_default_query");

      const id = crypto.randomUUID();
      const history: ChatMessage[] = turns.flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]);
      setTurns((prev) => [
        ...prev,
        {
          id,
          question: effectiveQuery,
          answer: "",
          sources: [],
          state: "streaming",
          images: imgs.length > 0 ? imgs : undefined,
        },
      ]);
      setInput("");
      setAttachments([]);
      await runStream(id, effectiveQuery, history, reasoning, false, imgs);
    },
    [busy, turns, runStream, tr],
  );

  // Re-run a turn with deeper thinking (the offer pill). History is the turns
  // before it, so the reasoning answer sees the same context.
  const reasoningRerun = useCallback(
    async (turnId: string) => {
      if (busy) return;
      const idx = turns.findIndex((t) => t.id === turnId);
      if (idx === -1) return;
      const target = turns[idx];
      const history: ChatMessage[] = turns.slice(0, idx).flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]);
      updateTurn(turnId, (t) => ({
        ...t,
        answer: "",
        sources: [],
        reasoning: undefined,
        reasoningOffered: false,
        state: "streaming",
      }));
      await runStream(turnId, target.question, history, true, false, target.images ?? []);
    },
    [busy, turns, updateTurn, runStream],
  );

  // Apply the reshape patch generated from a setup-intent turn.
  const confirmSetup = useCallback(
    async (turnId: string, patch: PlanPatch) => {
      const res = await reshapeExecutePatch(patch);
      if (res.ok) updateTurn(turnId, (t) => ({ ...t, setupApplied: true }));
    },
    [updateTurn],
  );

  // "Just answer my question": re-run the turn as a normal Ask (forceNormal).
  const dismissSetup = useCallback(
    async (turnId: string) => {
      if (busy) return;
      const idx = turns.findIndex((t) => t.id === turnId);
      if (idx === -1) return;
      const target = turns[idx];
      const history: ChatMessage[] = turns.slice(0, idx).flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]);
      updateTurn(turnId, (t) => ({
        ...t,
        setupIntent: false,
        setupHadImage: false,
        patch: undefined,
        answer: "",
        sources: [],
        state: "streaming",
      }));
      // Preserve any attached images so "just answer my question with the
      // image" re-runs the Ask with the image intact (forceNormal).
      await runStream(turnId, target.question, history, false, true, target.images ?? []);
    },
    [busy, turns, updateTurn, runStream],
  );

  // Re-run a failed turn in place. History is the turns that preceded it,
  // so the retry sees the same context the original attempt did.
  const retry = useCallback(
    async (turnId: string) => {
      if (busy) return;
      const idx = turns.findIndex((t) => t.id === turnId);
      if (idx === -1) return;
      const target = turns[idx];
      const history: ChatMessage[] = turns.slice(0, idx).flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.answer },
      ]);
      updateTurn(turnId, (t) => ({
        ...t,
        answer: "",
        sources: [],
        state: "streaming",
        errorCode: undefined,
        errorMessage: undefined,
      }));
      await runStream(turnId, target.question, history, false, false, target.images ?? []);
    },
    [busy, turns, updateTurn, runStream],
  );

  // Auto-scroll on new turn / streaming text.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns]);

  // Cmd/Ctrl + Enter sends.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "Enter") {
      // Cmd/Ctrl+Shift+Enter: submit with deeper thinking.
      e.preventDefault();
      if (reasoningMode !== "never") void send(input, true);
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void send(input);
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  // Section-scoped chats sit inside a page (Diet, Bills, Section detail) so
  // they take a fixed compact height. The general /dashboard/ask page uses
  // the full viewport.
  const containerHeight = scope
    ? "min-h-[360px] max-h-[560px]"
    : "h-[calc(100vh-160px)]";
  return (
    <div className={`flex ${containerHeight} flex-col`}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-6">
        {turns.length === 0 ? (
          <EmptyState
            scope={scope}
            suggestions={effectiveSuggestions}
            recentQuestions={recentQuestions}
            onSuggest={(q) => {
              setInput(q);
              textareaRef.current?.focus();
            }}
          />
        ) : (
          <ul className="space-y-8">
            {turns.map((t) => (
              <li key={t.id}>
                <TurnView
                  turn={t}
                  onRetry={() => retry(t.id)}
                  onReason={() => reasoningRerun(t.id)}
                  onSetupConfirm={(p) => confirmSetup(t.id, p)}
                  onSetupDismiss={() => dismissSetup(t.id)}
                  onImageClick={setLightbox}
                  busy={busy}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {crossSpaceAvailable && !scope ? (
        <ScopeControl
          everywhere={crossSpace}
          onChange={setCrossSpace}
          spaceName={spaceName}
        />
      ) : null}

      <Composer
        ref={textareaRef}
        value={input}
        busy={busy}
        placeholder={scope ? `Ask about ${scope.label}…` : undefined}
        attachments={attachments}
        notice={notice}
        onChange={setInput}
        onKeyDown={onKeyDown}
        onSubmit={() => send(input)}
        onAddFiles={addFiles}
        onRemoveAttachment={removeAttachment}
        onReason={reasoningMode !== "never" ? () => send(input, true) : undefined}
        reasonLabel={tr("think_harder")}
        reasonTooltip={tr("think_harder_tip")}
        attachLabel={tr("attach_images")}
      />

      {lightbox ? <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}

/** Full-size image overlay, opened by clicking a thumbnail on a turn. */
function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-6 animate-fade-up"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={attachment.dataUrl}
        alt={attachment.name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute end-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface/90 text-ink shadow-lg transition-base hover:bg-surface"
      >
        <CloseIcon size={18} />
      </button>
    </div>
  );
}

/**
 * Scope segmented control sitting directly above the chat input. Two clear,
 * side-by-side options with descriptions so the choice is unmissable:
 * "This workspace" (active space only) vs "Everything I can access" (every
 * space the user owns). The active option carries the brand accent. Shown
 * Personal-owner-only; the API re-checks active-org=personal AND role=owner,
 * so a forged flag can never broaden a Circle or Workspace search.
 */
function ScopeControl({
  everywhere,
  onChange,
  spaceName,
}: {
  everywhere: boolean;
  onChange: (everywhere: boolean) => void;
  spaceName: string | null;
}) {
  const t = useTranslations("ask.scope");
  return (
    <div
      role="radiogroup"
      aria-label={t("aria")}
      className="mb-2 inline-flex gap-1 rounded-lg border border-line bg-canvas/60 p-0.5"
    >
      <ScopeOption
        active={!everywhere}
        onClick={() => onChange(false)}
        title={t("this_label")}
        info={t("this_desc", { name: spaceName ?? t("this_fallback") })}
      />
      <ScopeOption
        active={everywhere}
        onClick={() => onChange(true)}
        title={t("all_label")}
        info={t("all_desc")}
      />
    </div>
  );
}

/**
 * Compact segmented scope control. Single line, light borders, the full
 * description moved to a tooltip so it does not dominate the page.
 */
function ScopeOption({
  active,
  onClick,
  title,
  info,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  info: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={info}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[13px] transition-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
        active
          ? "bg-brand/12 font-medium text-ink"
          : "text-ink-muted hover:text-ink"
      }`}
    >
      {title}
    </button>
  );
}

// Words that signal the user wants to see where an answer came from.
// When the question contains one of these, sources auto-expand;
// otherwise they're tucked behind a small "Show sources" link.
const SOURCE_INTENT = /\b(source|sources|file|files|where|which file|origin|proof|show me|attach|attachment|receipt|invoice|document|doc|pdf)\b/i;

function TurnView({
  turn,
  onRetry,
  onReason,
  onSetupConfirm,
  onSetupDismiss,
  onImageClick,
  busy,
}: {
  turn: Turn;
  onRetry: () => void;
  onReason: () => void;
  onSetupConfirm: (patch: PlanPatch) => void;
  onSetupDismiss: () => void;
  onImageClick: (a: Attachment) => void;
  busy: boolean;
}) {
  const t = useTranslations("ask");
  const wantsSources = SOURCE_INTENT.test(turn.question);
  const [sourcesOpen, setSourcesOpen] = useState(wantsSources);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  // Setup-intent turn: show the reshape preview inline instead of an answer.
  if (turn.setupIntent) {
    return (
      <article className="animate-fade-up">
        <p className="text-[13px] text-ink-faint">{t("you_asked")}</p>
        <p className="mt-1 text-[15px] text-ink">{turn.question}</p>
        {turn.images && turn.images.length > 0 ? (
          <TurnImages images={turn.images} onImageClick={onImageClick} />
        ) : null}
        <div className="mt-4 rounded-2xl border border-line bg-surface-raised px-4 py-3.5">
          {turn.setupApplied ? (
            <p className="text-[14px] text-ink">{t("setup_done")}</p>
          ) : turn.patch === null || turn.patch === undefined ? (
            <Thinking />
          ) : (
            <>
              <p className="mb-3 text-[13px] text-ink-soft">
                {turn.setupHadImage ? t("setup_transition_image") : t("setup_transition")}
              </p>
              <PatchPreview patch={turn.patch} onConfirm={() => onSetupConfirm(turn.patch as PlanPatch)} />
              <button
                type="button"
                onClick={onSetupDismiss}
                disabled={busy}
                className="mt-3 text-[12px] text-ink-faint transition-base hover:text-ink disabled:opacity-50"
              >
                {turn.setupHadImage ? t("setup_dismiss_image") : t("setup_dismiss")}
              </button>
            </>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="animate-fade-up">
      <p className="text-[13px] text-ink-faint">{t("you_asked")}</p>
      <p className="mt-1 text-[15px] text-ink">{turn.question}</p>
      {turn.images && turn.images.length > 0 ? (
        <TurnImages images={turn.images} onImageClick={onImageClick} />
      ) : null}

      {/* aria-live lets screen readers announce the answer as it streams
          in; aria-busy flags that more text is still arriving. */}
      <div
        className="mt-4 rounded-2xl border border-line bg-surface-raised px-4 py-3.5"
        role="status"
        aria-live="polite"
        aria-busy={turn.state === "streaming"}
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          <SparkIcon size={11} />
          <span>{turn.usedReasoning ? t("oria_reasoning") : "Oria"}</span>
        </div>
        {turn.state === "error" ? (
          <ErrorMessage
            code={turn.errorCode ?? "stream_failed"}
            message={turn.errorMessage}
            onRetry={onRetry}
            busy={busy}
          />
        ) : turn.answer.length === 0 && turn.state === "streaming" ? (
          turn.usedReasoning ? (
            <p className="text-[14px] text-ink-soft">{t("thinking_deeper")}</p>
          ) : (
            <Thinking />
          )
        ) : (
          <AnswerText answer={turn.answer} sources={turn.sources} />
        )}
      </div>

      {/* Offer pill: classifier flagged this as analytical and it was answered
          on the fast tier. Let the user re-run with deeper thinking. */}
      {turn.reasoningOffered && !turn.usedReasoning && turn.state === "done" ? (
        <button
          type="button"
          onClick={onReason}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft/20 px-3 py-1 text-[12px] text-ink transition-base hover:bg-accent-soft/40 disabled:opacity-50"
        >
          <SparkIcon size={11} />
          {t("reasoning_offer")}
        </button>
      ) : null}

      {/* View reasoning (Anthropic extended thinking), default collapsed. */}
      {turn.reasoning && turn.state === "done" ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setReasoningOpen((o) => !o)}
            className="text-[11.5px] text-ink-faint transition-base hover:text-ink"
          >
            {reasoningOpen ? t("hide_reasoning") : t("view_reasoning")}
          </button>
          {reasoningOpen ? (
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-canvas px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
              {turn.reasoning}
            </pre>
          ) : null}
        </div>
      ) : null}

      {turn.sources.length > 0 && turn.state !== "streaming" ? (
        <div className="mt-3">
          {sourcesOpen ? (
            <>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <p className="text-eyebrow">
                  Sources
                </p>
                <button
                  type="button"
                  onClick={() => setSourcesOpen(false)}
                  className="cursor-pointer text-[11px] text-ink-faint hover:text-ink transition-base"
                >
                  Hide
                </button>
              </div>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {turn.sources.map((s) => (
                  <li key={s.id}>
                    <SourceCard source={s} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSourcesOpen(true)}
              className="cursor-pointer text-[11.5px] text-ink-faint hover:text-ink transition-base"
            >
              Show sources ({turn.sources.length})
            </button>
          )}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Render the answer text with [N] citations rendered as small clickable chips
 * that scroll to the matching source card (and visually anchor the claim).
 */
function AnswerText({
  answer,
  sources,
}: {
  answer: string;
  sources: SourceItem[];
}) {
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  // Split on [N] tokens, preserving the tokens as separate parts.
  const parts = answer.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (!match) return <span key={i}>{part}</span>;
        const n = Number(match[1]);
        const src = sourceById.get(n);
        if (!src) return <span key={i}>{part}</span>;
        return (
          <a
            key={i}
            href={src.href}
            className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-md bg-canvas px-1.5 text-[10.5px] font-medium text-ink-soft transition-base hover:bg-ink hover:text-surface"
            aria-label={`Open source ${n}: ${src.title}`}
          >
            {n}
          </a>
        );
      })}
    </p>
  );
}

/** Browsers can't paint HEIC/HEIF, so those show a labelled chip instead. */
function isPaintable(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return m !== "image/heic" && m !== "image/heif";
}

/** Image thumbnails shown on a sent turn; click opens the full-size lightbox. */
function TurnImages({
  images,
  onImageClick,
}: {
  images: Attachment[];
  onImageClick: (a: Attachment) => void;
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {images.map((img) => (
        <li key={img.id}>
          <button
            type="button"
            onClick={() => onImageClick(img)}
            className="block h-16 w-16 overflow-hidden rounded-lg border border-line bg-canvas transition-base hover:border-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            aria-label={img.name}
          >
            {isPaintable(img.mimeType) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.dataUrl} alt={img.name} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center px-1 text-[9px] text-ink-faint">
                HEIC
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Thinking() {
  return (
    <p className="flex items-center gap-2 text-[13px] text-ink-faint">
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      Thinking…
    </p>
  );
}

function ErrorMessage({
  code,
  message,
  onRetry,
  busy,
}: {
  code: string;
  message?: string;
  onRetry: () => void;
  busy: boolean;
}) {
  // Specific, calm copy per known cause. Server-side codes ("no_key",
  // "rate_limited") match what the API route emits. HTTP-prefixed codes
  // come from the !res.ok branch; "stream_incomplete" is the client's
  // own guard for a stream that closed without a done/error frame.
  //
  // `no_key` and an expired session aren't fixed by retrying, so those
  // skip the Retry button. Everything else offers it.
  if (code === "no_key") {
    return (
      <p className="text-[13px] text-ink-muted">
        Ask Oria isn&apos;t connected to Claude yet. Add{" "}
        <code className="rounded border border-line bg-canvas px-1 py-0.5 text-[11px]">
          ANTHROPIC_API_KEY
        </code>{" "}
        to your environment and reload.
      </p>
    );
  }
  if (code === "http_401" || code === "http_403") {
    return (
      <p className="text-[13px] text-ink-muted">
        Your session expired. Refresh the page and try again.
      </p>
    );
  }

  let copy: string;
  if (code === "rate_limited" || code === "http_429") {
    copy =
      message ?? "You've asked a lot in a short window. Try again in a minute.";
  } else if (
    code.startsWith("http_5") ||
    code === "stream_failed" ||
    code === "stream_incomplete"
  ) {
    copy = "Ask Oria is briefly unreachable. Try again in a moment.";
  } else {
    copy = message ?? "Something went wrong. Try again in a moment.";
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="text-[13px] text-ink-muted">{copy}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="inline-flex h-6 cursor-pointer items-center rounded-md border border-line bg-canvas px-2 text-[11.5px] text-ink-soft transition-base hover:border-line-strong hover:text-ink disabled:cursor-default disabled:opacity-40"
      >
        Retry
      </button>
    </div>
  );
}

function EmptyState({
  scope,
  suggestions,
  recentQuestions,
  onSuggest,
}: {
  scope?: AskScope | null;
  suggestions: string[];
  recentQuestions: string[];
  onSuggest: (q: string) => void;
}) {
  const headline = scope
    ? `What do you want to know about ${scope.label}?`
    : "What would you like to remember?";
  const sub = scope
    ? `Scoped to ${scope.label}. Answers come from this section only.`
    : "Ask about anything you've uploaded, your reminders, or your calendar.";
  return (
    <div className="mx-auto max-w-xl pt-6 text-center animate-fade-up">
      <h1 className="text-[22px] font-semibold tracking-tight text-ink sm:text-[24px]">
        {headline}
      </h1>
      <p className="mt-2 text-[13.5px] text-ink-muted">{sub}</p>

      {recentQuestions.length > 0 ? (
        <div className="mt-6 space-y-1.5">
          <p className="text-eyebrow">
            You&apos;ve asked before
          </p>
          <ul className="flex flex-wrap justify-center gap-1.5">
            {recentQuestions.map((s) => (
              <li key={`recent-${s}`}>
                <button
                  type="button"
                  onClick={() => onSuggest(s)}
                  className="inline-flex h-8 items-center rounded-full border border-ink/30 bg-canvas px-3 text-[12px] text-ink transition-base hover:border-ink"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ul className="mt-5 flex flex-wrap justify-center gap-1.5">
        {suggestions.map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onSuggest(s)}
              className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-[12px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ComposerProps = {
  value: string;
  busy: boolean;
  placeholder?: string;
  attachments: Attachment[];
  notice: string | null;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (id: string) => void;
  /** Submit with deeper thinking (omitted when reasoning_mode is never). */
  onReason?: () => void;
  reasonLabel?: string;
  reasonTooltip?: string;
  attachLabel?: string;
};

const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(
  function Composer(
    {
      value,
      busy,
      placeholder,
      attachments,
      notice,
      onChange,
      onKeyDown,
      onSubmit,
      onAddFiles,
      onRemoveAttachment,
      onReason,
      reasonLabel,
      reasonTooltip,
      attachLabel,
    },
    ref,
  ) {
    const locale = useLocale() as Locale;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const canSend = value.trim().length > 0 || attachments.length > 0;

    function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
      const files = Array.from(e.clipboardData.files);
      if (files.length > 0) {
        e.preventDefault();
        onAddFiles(files);
      }
    }

    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="sticky bottom-0 pt-3"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length > 0) {
            e.preventDefault();
            setDragOver(false);
            onAddFiles(Array.from(e.dataTransfer.files));
          }
        }}
      >
        <div
          className={`rounded-2xl border bg-surface-raised p-2 shadow-[0_1px_2px_rgba(28,26,23,0.04),0_2px_8px_-6px_rgba(28,26,23,0.10)] transition-base focus-within:border-line-strong focus-within:shadow-[0_2px_4px_rgba(28,26,23,0.05),0_8px_24px_-14px_rgba(28,26,23,0.30)] ${
            dragOver ? "border-brand border-dashed" : "border-line"
          }`}
        >
          {attachments.length > 0 ? (
            <ul className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
              {attachments.map((a) => (
                <li key={a.id} className="relative">
                  <div className="h-14 w-14 overflow-hidden rounded-lg border border-line bg-canvas">
                    {isPaintable(a.mimeType) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[9px] text-ink-faint">
                        HEIC
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(a.id)}
                    aria-label={`Remove ${a.name}`}
                    className="absolute -end-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-ink-soft shadow-sm transition-base hover:text-ink"
                  >
                    <CloseIcon size={11} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) onAddFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || attachments.length >= MAX_IMAGES}
              title={attachLabel}
              aria-label={attachLabel}
              className="mb-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-ink-soft transition-base hover:border-line-strong hover:text-ink disabled:opacity-40"
            >
              <PaperclipIcon size={16} />
            </button>
            <AutoGrowTextarea
              ref={ref}
              value={value}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              minRows={1}
              maxRows={6}
              autoFocus
              placeholder={placeholder ?? "Ask Oria anything…"}
              className="block min-h-[40px] flex-1 bg-transparent px-2 py-2 text-[14.5px] text-ink placeholder:text-ink-faint outline-none"
            />
            <MicButton
              onTranscribed={(text) => onChange(value ? `${value} ${text}` : text)}
              targetLanguage={locale}
              size="sm"
              className="mb-0.5"
            />
            {onReason ? (
              <button
                type="button"
                onClick={onReason}
                disabled={busy || !canSend}
                title={reasonTooltip}
                aria-label={reasonLabel}
                className="mb-0.5 inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-line px-2.5 text-[12px] text-ink-soft transition-base hover:border-line-strong hover:text-ink disabled:opacity-40"
              >
                <SparkIcon size={12} />
                <span className="hidden sm:inline">{reasonLabel}</span>
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy || !canSend}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-surface transition-base hover:bg-ink-soft disabled:opacity-40"
              aria-label="Send question"
            >
              <ArrowRightIcon size={14} />
            </button>
          </div>
        </div>
        {notice ? (
          <p className="mt-1.5 px-1 text-[11px] text-warning">{notice}</p>
        ) : (
          <p className="mt-1.5 px-1 text-[11px] text-ink-faint">
            Enter to send, Shift + Enter for newline.
          </p>
        )}
      </form>
    );
  },
);
