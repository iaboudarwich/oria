"use client";

import { useState, useTransition } from "react";
import { disconnectWhoop } from "@/lib/data/whoop-actions";

/** Disconnect WHOOP. Two-step (click, then confirm) so it is never a one-tap
 *  accident; mirrors the other connectors' disconnect affordance. */
export function WhoopDisconnectButton({
  label,
  confirmLabel,
  pendingLabel,
}: {
  label: string;
  confirmLabel: string;
  pendingLabel: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        startTransition(() => disconnectWhoop());
      }}
      className="transition-base inline-flex h-8 items-center rounded-lg border border-line px-3 text-[12px] text-ink hover:bg-canvas disabled:opacity-50"
    >
      {pending ? pendingLabel : armed ? confirmLabel : label}
    </button>
  );
}
