"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AutoGrowTextarea } from "@/components/ui/auto-grow-textarea";
import { Button } from "@/components/ui/button";
import { confirmPaste } from "@/lib/data/paste-actions";

type Offer = {
  offer: true;
  section: string;
  sectionLabel: string;
  documentType: string | null;
  title: string;
};

/**
 * Smart paste capture. The user pastes a block (a flight email, a receipt) and
 * Oria classifies it, then offers to file it in the right section ("Add to
 * Travel?"). Nothing is filed until the user confirms, at which point the real
 * extraction pipeline runs (confirmPaste -> logFromText).
 */
export function SmartPaste() {
  const t = useTranslations("smartPaste");
  const router = useRouter();
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [filed, setFiled] = useState<string | null>(null);
  // Instant "Added to X" the moment the user taps, reconciled in the background
  // (React 19 useOptimistic). Reverts automatically if the save fails.
  const [optimisticFiled, showOptimisticFiled] = useOptimistic<string | null, string>(
    null,
    (_, msg) => msg,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reqId = useRef(0);

  async function classify(value: string) {
    if (value.trim().length < 120) {
      setOffer(null);
      return;
    }
    const mine = ++reqId.current;
    setChecking(true);
    setError(null);
    setFiled(null);
    try {
      const res = await fetch("/api/paste/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = (await res.json()) as Offer | { offer: false };
      if (mine !== reqId.current) return; // a newer paste superseded this one
      setOffer(data.offer ? (data as Offer) : null);
    } catch {
      if (mine === reqId.current) setOffer(null);
    } finally {
      if (mine === reqId.current) setChecking(false);
    }
  }

  function add() {
    if (!offer) return;
    const timezone =
      typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC";
    const nowISO = new Date().toISOString();
    const confirmation = t("filed", { section: offer.sectionLabel });
    startTransition(async () => {
      showOptimisticFiled(confirmation); // reflect immediately
      const res = await confirmPaste({ text: text.trim(), section: offer.section, timezone, nowISO });
      if (res.ok) {
        setFiled(confirmation);
        setOffer(null);
        setText("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-eyebrow">{t("heading")}</h2>
      <div className="rounded-2xl border border-line bg-surface-raised p-3 space-y-2">
        <AutoGrowTextarea
          value={text}
          onChange={(v) => {
            setText(v);
            setError(null);
            setFiled(null);
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            // Read the textarea's resulting value next tick (covers replace +
            // append), then classify.
            window.setTimeout(() => {
              const el = e.target as HTMLTextAreaElement;
              void classify(el.value || pasted);
            }, 0);
          }}
          placeholder={t("placeholder")}
          minRows={2}
          maxRows={8}
          className="block w-full rounded-xl bg-canvas/40 px-3 py-2 text-[13px] text-ink placeholder:text-ink-faint outline-none transition-base focus:bg-canvas"
        />

        {checking ? <p className="px-1 text-[11.5px] text-ink-faint">{t("reading")}</p> : null}

        {offer && !checking ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft/40 px-3 py-2">
            <p className="flex-1 text-[12.5px] text-ink-soft">
              {offer.documentType
                ? t("offer_typed", { type: offer.documentType, section: offer.sectionLabel })
                : t("offer", { section: offer.sectionLabel })}
            </p>
            <Button size="sm" onClick={add} disabled={pending}>
              {t("add", { section: offer.sectionLabel })}
            </Button>
            <button
              type="button"
              onClick={() => setOffer(null)}
              className="text-[12px] text-ink-muted transition-base hover:text-ink"
            >
              {t("dismiss")}
            </button>
          </div>
        ) : null}

        {(optimisticFiled ?? filed) ? (
          <p className="px-1 text-[12px] text-ink-muted">{optimisticFiled ?? filed}</p>
        ) : null}
        {error ? <p className="px-1 text-[12px] text-claret">{error}</p> : null}
      </div>
    </section>
  );
}
