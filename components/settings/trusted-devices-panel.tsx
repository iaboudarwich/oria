"use client";

import { useState, useTransition } from "react";
import { revokeTrustedDevice } from "@/lib/data/trusted-device-actions";
import type { TrustedDeviceRow } from "@/lib/auth/trusted-device";
import { relativeTime } from "@/lib/utils";

/**
 * Settings → Security: the devices the user has trusted (chosen "remember this
 * device" after the second factor). A trusted device skips the second-factor
 * step at sign-in until it expires or is removed here. Removing one means it
 * has to confirm again next time. View + revoke; the panel is plain language.
 */
export function TrustedDevicesPanel({ devices }: { devices: TrustedDeviceRow[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, startTransition] = useTransition();
  const visible = devices.filter((d) => !hidden.has(d.id));

  function remove(id: string) {
    setHidden((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await revokeTrustedDevice(id);
    });
  }

  function expiryLabel(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">Trusted devices</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          On a trusted device you skip the extra confirmation step when you sign
          in. Remove any device you no longer use; it will have to confirm again
          next time.
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-line bg-canvas p-4 text-[13px] text-ink-faint">
          No trusted devices yet. When you sign in and choose to remember this
          device, it will show up here.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface-raised divide-y divide-line">
          {visible.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-ink">
                  {d.label ?? "Unknown device"}
                  {d.current ? (
                    <span className="ms-2 rounded-md bg-sage/15 px-1.5 py-0.5 text-[10.5px] text-sage">
                      This device
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[11.5px] text-ink-faint">
                  Last used {relativeTime(d.last_used_at)} · Expires {expiryLabel(d.expires_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(d.id)}
                className="shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
