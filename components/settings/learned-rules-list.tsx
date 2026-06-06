"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { removeRoutingRule } from "@/lib/data/routing-rule-actions";

export type LearnedRule = {
  id: string;
  matchValue: string;
  sectionName: string;
};

/** Removable list of the rules Oria has learned from the user's corrections. */
export function LearnedRulesList({ rules }: { rules: LearnedRule[] }) {
  const t = useTranslations("learnRule");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [removed, setRemoved] = useState<Set<string>>(new Set());

  function remove(id: string) {
    setRemoved((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await removeRoutingRule(id);
      router.refresh();
    });
  }

  const visible = rules.filter((r) => !removed.has(r.id));
  if (visible.length === 0) {
    return <p className="text-[12.5px] text-ink-faint">{t("rules_empty")}</p>;
  }

  return (
    <ul className="space-y-1.5">
      {visible.map((r) => (
        <li
          key={r.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2"
        >
          <span className="min-w-0 truncate text-[12.5px] text-ink-soft">
            {t("rule_line", { vendor: r.matchValue, section: r.sectionName })}
          </span>
          <button
            type="button"
            onClick={() => remove(r.id)}
            disabled={pending}
            className="transition-base shrink-0 text-[12px] text-ink-faint hover:text-claret disabled:opacity-50"
          >
            {t("remove")}
          </button>
        </li>
      ))}
    </ul>
  );
}
