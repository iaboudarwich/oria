"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  approveDetectedItem,
  dismissDetectedItem,
  approveItems,
  dismissItems,
} from "@/lib/integrations/gmail/approve-actions";

export type ReviewItem = {
  id: string;
  connectionId: string | null;
  sourceEmail: string | null;
  itemType: string;
  sourceSubject: string | null;
  sourceFrom: string | null;
  sourceDate: string | null;
  confidence: number | null;
  extracted: {
    title?: string;
    vendor?: string | null;
    amount?: number | null;
    currency?: string | null;
    period?: string | null;
    renewal_date?: string | null;
    event_date?: string | null;
    summary?: string | null;
    order_id?: string | null;
    due_date?: string | null;
    origin?: string | null;
    destination?: string | null;
    departure?: string | null;
    location?: string | null;
    provider?: string | null;
  };
};

const TYPE_KEYS: Record<string, string> = {
  subscription: "type_subscription",
  bill: "type_bill",
  flight: "type_flight",
  booking: "type_booking",
  receipt: "type_receipt",
  appointment: "type_appointment",
  other: "type_other",
};

const HIGH_CONFIDENCE = 0.8;

/** Worded confidence badge: >=0.75 confident, >=0.5 likely, else maybe. */
function confidenceKey(c: number | null): string {
  if (c == null) return "conf_maybe";
  if (c >= 0.75) return "conf_high";
  if (c >= 0.5) return "conf_likely";
  return "conf_maybe";
}

/**
 * Interactive review + approval list. Groups detected items by type, supports
 * per-item and bulk approve/dismiss, a one-click "approve all high-confidence"
 * suggestion, and an expandable source panel. High-confidence items are
 * pre-selected so the common case is a single bulk approve.
 */
export function GmailReviewList({
  items,
  sources = [],
}: {
  items: ReviewItem[];
  sources?: string[];
}) {
  const t = useTranslations("gmailReview");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState<string>("all");
  const [activeSource, setActiveSource] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.filter((i) => (i.confidence ?? 0) >= HIGH_CONFIDENCE).map((i) => i.id)),
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  // Types present, in a stable display order.
  const tabs = useMemo(() => {
    const order = ["receipt", "bill", "subscription", "flight", "booking", "appointment", "other"];
    const present = order.filter((tp) => items.some((i) => i.itemType === tp));
    return ["all", ...present];
  }, [items]);

  const visible = useMemo(() => {
    let v = items;
    if (activeSource !== "all") v = v.filter((i) => i.sourceEmail === activeSource);
    if (activeTab !== "all") v = v.filter((i) => i.itemType === activeTab);
    return v;
  }, [items, activeTab, activeSource]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = visible.every((i) => next.has(i.id));
      for (const i of visible) {
        if (allSelected) next.delete(i.id);
        else next.add(i.id);
      }
      return next;
    });
  }

  function fmtDate(iso?: string | null) {
    if (!iso) return "";
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return "";
    return new Date(ms).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const selectedInVisible = visible.filter((i) => selected.has(i.id)).length;

  return (
    <div className="space-y-4">
      {/* Source filter chips (only with more than one inbox in play) */}
      {sources.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {["all", ...sources].map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setActiveSource(src)}
              className={`transition-base max-w-full truncate rounded-full px-3 py-1 text-[12px] ${
                activeSource === src
                  ? "bg-ink text-surface"
                  : "border border-line text-ink-muted hover:text-ink"
              }`}
            >
              {src === "all" ? t("all_inboxes") : src}
            </button>
          ))}
        </div>
      ) : null}

      {/* Type tabs */}
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
          const count =
            tab === "all" ? items.length : items.filter((i) => i.itemType === tab).length;
          const label = tab === "all" ? t("tab_all") : t(TYPE_KEYS[tab] ?? "type_other");
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`transition-base rounded-full px-3 py-1 text-[12.5px] ${
                activeTab === tab
                  ? "bg-ink text-surface"
                  : "border border-line text-ink-muted hover:text-ink"
              }`}
            >
              {label} <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Bulk bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <button
          type="button"
          onClick={selectAllVisible}
          className="transition-base text-[12.5px] text-ink-muted hover:text-ink"
        >
          {t("select_all")}
        </button>
        <span className="text-ink-faint">·</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => approveItems([...selected]))}
          className="transition-base rounded-lg bg-ink px-3 py-1.5 text-[12.5px] font-medium text-surface hover:bg-ink-soft disabled:opacity-50"
        >
          {selectedInVisible > 0 ? t("approve_n", { count: selected.size }) : t("approve")}
        </button>
        <button
          type="button"
          disabled={pending || selected.size === 0}
          onClick={() => run(() => dismissItems([...selected]))}
          className="transition-base rounded-lg border border-line-strong px-3 py-1.5 text-[12.5px] font-medium text-ink hover:bg-surface-raised disabled:opacity-50"
        >
          {t("dismiss_n", { count: selected.size })}
        </button>
        <span className="ml-auto" />
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() =>
              approveItems(
                items.filter((i) => (i.confidence ?? 0) >= HIGH_CONFIDENCE).map((i) => i.id),
              ),
            )
          }
          className="transition-base text-[12.5px] font-medium text-ink underline-offset-2 hover:underline disabled:opacity-50"
        >
          {t("suggest_high")}
        </button>
      </div>

      {/* Items */}
      <ul className="space-y-2">
        {visible.map((item) => {
          const ex = item.extracted ?? {};
          const isOpen = expanded === item.id;
          return (
            <li key={item.id} className="rounded-xl border border-line bg-surface-raised px-4 py-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="mt-1 h-4 w-4 shrink-0 accent-ink"
                  aria-label={ex.title ?? item.sourceSubject ?? ""}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                      {t(TYPE_KEYS[item.itemType] ?? "type_other")}
                    </span>
                    <p className="truncate text-[14px] font-medium text-ink">
                      {ex.title || item.sourceSubject || t("type_other")}
                    </p>
                    <span
                      className="ml-auto shrink-0 rounded-full bg-surface px-2 py-0.5 text-[10.5px] font-medium text-ink-faint"
                      title={
                        item.confidence != null
                          ? `${Math.round(item.confidence * 100)}%`
                          : undefined
                      }
                    >
                      {t(confidenceKey(item.confidence))}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-muted">
                    {sources.length > 1 && item.sourceEmail ? (
                      <span className="rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-ink-faint">
                        {t("from_inbox", { email: item.sourceEmail })}
                      </span>
                    ) : null}
                    {ex.vendor ? <span>{ex.vendor}</span> : null}
                    {ex.amount != null ? (
                      <span>
                        {ex.amount} {ex.currency ?? ""}
                        {ex.period ? ` / ${ex.period}` : ""}
                      </span>
                    ) : null}
                    {ex.origin && ex.destination ? (
                      <span>
                        {ex.origin} {"→"} {ex.destination}
                      </span>
                    ) : null}
                    {ex.renewal_date ? (
                      <span>{t("renews_on", { date: fmtDate(ex.renewal_date) })}</span>
                    ) : null}
                    {ex.due_date ? (
                      <span>{t("due_on", { date: fmtDate(ex.due_date) })}</span>
                    ) : null}
                    {ex.event_date ? (
                      <span>{t("event_on", { date: fmtDate(ex.event_date) })}</span>
                    ) : null}
                    {ex.order_id ? <span>#{ex.order_id}</span> : null}
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => approveDetectedItem(item.id))}
                      className="transition-base rounded-lg bg-ink px-3 py-1 text-[12px] font-medium text-surface hover:bg-ink-soft disabled:opacity-50"
                    >
                      {t("approve")}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => dismissDetectedItem(item.id))}
                      className="transition-base rounded-lg border border-line-strong px-3 py-1 text-[12px] font-medium text-ink hover:bg-surface disabled:opacity-50"
                    >
                      {t("dismiss")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : item.id)}
                      className="transition-base ml-auto text-[12px] text-ink-faint hover:text-ink"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? t("hide_source") : t("view_source")}
                    </button>
                  </div>

                  {isOpen ? (
                    <div className="mt-2 space-y-1 rounded-lg bg-surface px-3 py-2 text-[12px] text-ink-muted">
                      {item.sourceSubject ? <p className="text-ink">{item.sourceSubject}</p> : null}
                      {item.sourceFrom ? <p>{t("from", { sender: item.sourceFrom })}</p> : null}
                      {item.sourceDate ? <p>{fmtDate(item.sourceDate)}</p> : null}
                      {ex.summary ? <p className="pt-1">{ex.summary}</p> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
