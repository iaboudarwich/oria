"use client";

import {
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icon";

type Props = {
  label: string;
  hint?: ReactNode;
  /** Render a zxcvbn-backed strength meter below the field. */
  showStrength?: boolean;
  /** Five labels indexed by zxcvbn score (0..4). Passed in so the copy can
   *  be localized by the page. */
  strengthLabels?: [string, string, string, string, string];
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

// zxcvbn is heavy (~400kb). Load it lazily on first keystroke and cache the
// module so the auth bundle stays lean for everyone who never types.
type Zxcvbn = (password: string) => { score: 0 | 1 | 2 | 3 | 4 };
let zxcvbnModule: Zxcvbn | null = null;

const BAR_COLORS = [
  "bg-claret",
  "bg-claret",
  "bg-accent",
  "bg-brand",
  "bg-brand",
];

/**
 * Password input with a small show/hide eye icon. Visual styling matches the
 * other auth fields exactly. When `showStrength` is set it also renders a
 * four-segment strength meter driven by zxcvbn.
 */
export function PasswordField({
  label,
  hint,
  showStrength = false,
  strengthLabels,
  ...rest
}: Props) {
  const [visible, setVisible] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const loading = useRef(false);

  async function evaluate(value: string) {
    if (!value) {
      setScore(null);
      return;
    }
    if (!zxcvbnModule && !loading.current) {
      loading.current = true;
      const mod = await import("zxcvbn");
      zxcvbnModule = mod.default as unknown as Zxcvbn;
    }
    if (zxcvbnModule) setScore(zxcvbnModule(value).score);
  }

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
          onChange={(e) => {
            rest.onChange?.(e);
            if (showStrength) void evaluate(e.target.value);
          }}
          className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 pr-11 text-[16px] text-ink placeholder:text-ink-faint outline-none transition-base focus:border-ink"
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

      {showStrength && score !== null ? (
        <div className="mt-2">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-base ${
                  i <= score - 1 || (score === 0 && i === 0)
                    ? BAR_COLORS[score]
                    : "bg-line-strong"
                }`}
              />
            ))}
          </div>
          {strengthLabels ? (
            <p className="mt-1 text-[11.5px] text-ink-faint">
              {strengthLabels[score]}
            </p>
          ) : null}
        </div>
      ) : null}
    </label>
  );
}
