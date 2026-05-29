"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

/**
 * Text input with brand focus ring, error state with danger glow,
 * and optional top label.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ error, label, className = "", id, ...props }, ref) {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[13px] font-medium text-ink"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            "block h-10 w-full rounded-xl border bg-surface-raised px-3.5 text-[14px] text-ink",
            "placeholder:text-ink-faint outline-none",
            "transition-all duration-[150ms]",
            error
              ? "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(155,74,74,0.12)]"
              : "border-line-strong focus:border-brand focus:shadow-[0_0_0_3px_rgba(91,95,221,0.12)]",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
        {error && (
          <p className="text-[12px] text-danger">{error}</p>
        )}
      </div>
    );
  },
);
