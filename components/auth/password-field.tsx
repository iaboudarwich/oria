"use client";

import { useState, type InputHTMLAttributes, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icon";

type Props = {
  label: string;
  hint?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Password input with a small show/hide eye icon. Visual styling matches the
 * other auth fields exactly — the only difference is the toggle.
 */
export function PasswordField({ label, hint, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[12px] text-ink-muted">
        <span>{label}</span>
        {hint}
      </span>
      <div className="relative">
        <input
          {...rest}
          type={visible ? "text" : "password"}
          className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 pr-11 text-[14px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-ink"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-xl text-ink-faint transition-base hover:text-ink"
        >
          {visible ? <EyeOffIcon size={14} /> : <EyeIcon size={14} />}
        </button>
      </div>
    </label>
  );
}
