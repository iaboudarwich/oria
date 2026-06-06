"use client";

import { useState, useTransition } from "react";
import { setAccountLanguage, setWorkspaceContentLanguage } from "@/lib/data/language-actions";
import { LOCALE_LABELS, locales, type Locale } from "@/i18n/config";

export function LanguageSwitcher({
  currentAccountLanguage,
  currentWorkspaceLanguage,
  organizationId,
  isOwner,
}: {
  currentAccountLanguage: Locale;
  currentWorkspaceLanguage: Locale;
  organizationId: string;
  isOwner: boolean;
}) {
  const [accountLang, setAccountLang] = useState<Locale>(currentAccountLanguage);
  const [workspaceLang, setWorkspaceLang] = useState<Locale>(currentWorkspaceLanguage);
  const [, startTransition] = useTransition();

  function handleAccountChange(lang: Locale) {
    setAccountLang(lang);
    startTransition(() => void setAccountLanguage(lang));
  }

  function handleWorkspaceChange(lang: Locale) {
    setWorkspaceLang(lang);
    startTransition(() => void setWorkspaceContentLanguage(organizationId, lang));
  }

  return (
    <div className="space-y-5">
      {/* Account language */}
      <div>
        <label className="mb-1 block text-[13px] text-ink">Account language</label>
        <p className="mb-2 text-[11.5px] text-ink-faint">
          Controls the language of buttons, menus, and navigation.
        </p>
        <select
          value={accountLang}
          onChange={(e) => handleAccountChange(e.target.value as Locale)}
          className="block h-10 w-full max-w-xs rounded-xl border border-line bg-surface-raised px-3 text-[14px] text-ink outline-none focus:border-ink"
        >
          {locales.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </select>
      </div>

      {/* Workspace content language. owner only */}
      {isOwner && (
        <div>
          <label className="mb-1 block text-[13px] text-ink">Workspace content language</label>
          <p className="mb-2 text-[11.5px] text-ink-faint">
            Controls section names and AI-generated content for this workspace.
          </p>
          <select
            value={workspaceLang}
            onChange={(e) => handleWorkspaceChange(e.target.value as Locale)}
            className="block h-10 w-full max-w-xs rounded-xl border border-line bg-surface-raised px-3 text-[14px] text-ink outline-none focus:border-ink"
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {LOCALE_LABELS[l]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
