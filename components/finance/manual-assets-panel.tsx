"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createManualAsset,
  archiveManualAsset,
  setAssetExcluded,
  type ManualAsset,
} from "@/lib/data/net-worth";
import { KIND_LABEL, colorForKind } from "./allocation-donut";
import type { ManualAssetKind } from "@/lib/net-worth/compute";

const KIND_ORDER: ManualAssetKind[] = [
  "cash",
  "investment",
  "crypto",
  "property",
  "vehicle",
  "other",
  "debt",
];

/**
 * Add + manage manual holdings. Net worth has no bank link yet (Plaid is
 * post-launch), so this is how the line and donut get their data. Each holding
 * is org-scoped, so what you add here belongs to the space you are in.
 */
export function ManualAssetsPanel({ assets }: { assets: ManualAsset[] }) {
  const t = useTranslations("netWorth");
  const router = useRouter();
  const [open, setOpen] = useState(assets.length === 0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<ManualAssetKind>("cash");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");

  function add() {
    setError(null);
    const value = Number(amount.replace(/,/g, ""));
    if (!label.trim() || !Number.isFinite(value)) {
      setError(t("add_error"));
      return;
    }
    startTransition(async () => {
      const res = await createManualAsset({
        kind,
        label: label.trim(),
        amount: value,
        currency: currency.trim().toUpperCase() || "USD",
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLabel("");
      setAmount("");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-eyebrow">{t("holdings")}</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[12.5px] text-ink-muted transition-base hover:text-ink"
        >
          {open ? t("close") : t("add_holding")}
        </button>
      </div>

      {open ? (
        <div className="space-y-3 rounded-2xl border border-line bg-surface-raised p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-muted">{t("type")}</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ManualAssetKind)}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-[13.5px] text-ink"
              >
                {KIND_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-muted">{t("name")}</span>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
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
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-muted">{t("currency")}</span>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="USD"
                maxLength={3}
              />
            </label>
          </div>
          {error ? <p className="text-[12px] text-claret">{error}</p> : null}
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={add} disabled={pending}>
              {t("save")}
            </Button>
            <span className="text-[11.5px] text-ink-faint">{t("debt_hint")}</span>
          </div>
        </div>
      ) : null}

      {assets.length > 0 ? (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface-raised">
          {assets.map((a) => (
            <AssetRow key={a.id} asset={a} onChange={() => router.refresh()} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AssetRow({ asset, onChange }: { asset: ManualAsset; onChange: () => void }) {
  const t = useTranslations("netWorth");
  const [pending, startTransition] = useTransition();
  const amount = asset.amount.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
        style={{ background: colorForKind(asset.kind) }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-ink">
          {asset.label}
          {asset.exclude_from_insights ? (
            <span className="ml-2 text-[11px] text-ink-faint">{t("not_counted")}</span>
          ) : null}
        </p>
        <p className="text-[11.5px] text-ink-faint">{KIND_LABEL[asset.kind]}</p>
      </div>
      <span className="tabular-nums text-[13px] text-ink">
        {amount} {asset.currency}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setAssetExcluded(asset.id, !asset.exclude_from_insights);
              onChange();
            })
          }
          className="text-[11.5px] text-ink-muted transition-base hover:text-ink"
        >
          {asset.exclude_from_insights ? t("count") : t("exclude")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await archiveManualAsset(asset.id);
              onChange();
            })
          }
          className="text-[11.5px] text-ink-muted transition-base hover:text-claret"
        >
          {t("remove")}
        </button>
      </div>
    </li>
  );
}
