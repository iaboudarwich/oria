"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, LinkIcon } from "@/components/ui/icon";
import type { Invite } from "@/lib/supabase/types";

/**
 * The "what to share" card. Code is the hero (large, breathable, monospace
 * tiles), the link is a single soft Copy-link button below. Tap "View full
 * link" to reveal the URL. No dense rows of plain text.
 */
export function InviteResultCard({
  invite,
  highlight,
}: {
  invite: Invite;
  highlight?: boolean;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    // Defer to a microtask so setState isn't called synchronously inside the
    // effect body (react-hooks/set-state-in-effect).
    queueMicrotask(() => setOrigin(window.location.origin));
  }, []);

  const link = origin ? `${origin}/invite/${invite.token}` : "";

  return (
    <div
      className={`rounded-2xl border bg-surface-raised p-4 ${
        highlight
          ? "border-line-strong shadow-[0_1px_2px_rgba(28,26,23,0.04),0_6px_20px_-12px_rgba(28,26,23,0.18)]"
          : "border-line"
      }`}
    >
      <p className="text-center text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
        Invite code
      </p>

      <CodeTiles code={invite.code} />

      <div className="mt-3 flex items-center justify-center gap-2">
        <CopyButton value={invite.code} label="Copy code" icon="copy" />
        <CopyButton value={link} label="Copy link" icon="link" disabled={!link} />
      </div>

      <RevealLink href={link} />

      <p className="mt-4 text-center text-[11px] text-ink-faint">
        One-time use. Expires in 14 days.
      </p>
    </div>
  );
}

function CodeTiles({ code }: { code: string }) {
  // Split "ABCD-2345" into ["ABCD", "2345"], then render each char as a tile.
  const groups = code.split("-");
  return (
    <div className="mt-3 flex items-center justify-center gap-2">
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center gap-1">
          {group.split("").map((ch, ci) => (
            <span
              key={ci}
              className="inline-flex h-9 w-7 select-all items-center justify-center rounded-md border border-line bg-canvas/60 font-mono text-[15px] font-medium text-ink"
            >
              {ch}
            </span>
          ))}
          {gi < groups.length - 1 ? (
            <span className="mx-0.5 h-px w-2 bg-ink-faint" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CopyButton({
  value,
  label,
  icon,
  disabled,
}: {
  value: string;
  label: string;
  icon: "copy" | "link";
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] transition-base disabled:opacity-40 ${
        copied
          ? "border-sage/30 bg-sage/10 text-[#3f5240]"
          : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink"
      }`}
    >
      {copied ? (
        <>
          <CheckIcon size={12} /> Copied
        </>
      ) : (
        <>
          {icon === "copy" ? <CopyIcon size={12} /> : <LinkIcon size={12} />}
          {label}
        </>
      )}
    </button>
  );
}

function RevealLink({ href }: { href: string }) {
  const [shown, setShown] = useState(false);
  if (!href) {
    return (
      <p className="mt-3 text-center text-[11px] text-ink-faint">
        Generating link...
      </p>
    );
  }
  if (!shown) {
    return (
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={() => setShown(true)}
          className="text-[11.5px] text-ink-faint hover:text-ink transition-base"
        >
          View full link
        </button>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-lg border border-line bg-canvas/60 px-3 py-2">
      <p className="break-all text-center font-mono text-[11.5px] leading-relaxed text-ink-muted">
        {href}
      </p>
    </div>
  );
}
