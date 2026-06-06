"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createTrackableManual,
  setTrackableStatus,
  setTrackableExcluded,
  archiveTrackable,
} from "@/lib/data/trackable-actions";
import type { Trackable } from "@/lib/data/trackables";

const ADD_CATEGORIES = ["subscription", "goal", "wishlist", "membership"] as const;
const PERIODS = ["monthly", "quarterly", "annually", "once"] as const;

/** Add a subscription, goal, or wishlist item by hand. */
export function AddTrackableForm() {
  const t = useTranslations("trackablesUi");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<(typeof ADD_CATEGORIES)[number]>("subscription");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("monthly");

  const showCadence = category === "subscription" || category === "membership";

  function add() {
    setError(null);
    if (!title.trim()) {
      setError(t("add_error"));
      return;
    }
    const value = amount.trim() ? Number(amount.replace(/,/g, "")) : null;
    startTransition(async () => {
      const res = await createTrackableManual({
        category,
        title: title.trim(),
        costAmount: value,
        costCurrency: currency,
        costPeriod: showCadence ? period : null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTitle("");
      setAmount("");
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="transition-base text-[13px] text-ink-muted hover:text-ink"
      >
        {t("add")}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-raised p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-muted">{t("kind")}</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof ADD_CATEGORIES)[number])}
            className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-[13.5px] text-ink"
          >
            {ADD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`kind_${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-muted">{t("name")}</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("name_placeholder")}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-muted">{t("amount")}</span>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </label>
        {showCadence ? (
          <label className="block">
            <span className="mb-1 block text-[11px] text-ink-muted">{t("cadence")}</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as (typeof PERIODS)[number])}
              className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-[13.5px] text-ink"
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {t(`period_${p}`)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-[11px] text-ink-muted">{t("currency")}</span>
            <Input
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={3}
              placeholder="USD"
            />
          </label>
        )}
      </div>
      {error ? <p className="text-[12px] text-claret">{error}</p> : null}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={add} disabled={pending}>
          {t("save")}
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="transition-base text-[12.5px] text-ink-muted hover:text-ink"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

/** Per-item controls: won't-do / done for goals + wishlist, exclude, remove. */
export function TrackableRowActions({ trackable }: { trackable: Trackable }) {
  const t = useTranslations("trackablesUi");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const goalLike = trackable.category === "goal" || trackable.category === "wishlist";

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
      {trackable.status !== "active" ? (
        <span className="text-[11px] text-ink-faint">
          {trackable.status === "wont_do" ? t("status_wont_do") : t("status_done")}
        </span>
      ) : null}
      {goalLike && trackable.status === "active" ? (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setTrackableStatus(trackable.id, "done"))}
            className="transition-base text-[11.5px] text-ink-muted hover:text-ink"
          >
            {t("mark_done")}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setTrackableStatus(trackable.id, "wont_do"))}
            className="transition-base text-[11.5px] text-ink-muted hover:text-ink"
          >
            {t("wont_do")}
          </button>
        </>
      ) : null}
      {goalLike && trackable.status !== "active" ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setTrackableStatus(trackable.id, "active"))}
          className="transition-base text-[11.5px] text-ink-muted hover:text-ink"
        >
          {t("reactivate")}
        </button>
      ) : null}
      {trackable.cost_amount ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => setTrackableExcluded(trackable.id, !trackable.exclude_from_insights))
          }
          className="transition-base text-[11.5px] text-ink-muted hover:text-ink"
        >
          {trackable.exclude_from_insights ? t("count") : t("exclude")}
        </button>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => archiveTrackable(trackable.id))}
        className="transition-base text-[11.5px] text-ink-muted hover:text-claret"
      >
        {t("remove")}
      </button>
    </div>
  );
}
