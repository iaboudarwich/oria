import { CheckIcon } from "@/components/ui/icon";
import type { EmailOutcome } from "@/lib/data/circle-actions";

/**
 * Tiny inline status under the invite-creator success state + the resend
 * action. Keeps wording calm, but when a send actually fails we now
 * show the *real* reason (e.g. "Sending domain isn't verified on Resend
 * yet.") rather than a generic banner — the operator needs to know.
 */
export function EmailStatusLine({
  outcome,
  recipient,
}: {
  outcome: EmailOutcome;
  recipient: string;
}) {
  if (outcome.status === "sent") {
    return (
      <p className="flex items-center gap-1.5 text-[12.5px] text-[#3f5240]">
        <CheckIcon size={12} /> Email sent to {recipient}
      </p>
    );
  }
  if (outcome.status === "skipped") {
    return (
      <p className="text-[12.5px] text-ink-muted">
        Email isn&apos;t set up yet. Share the link or code below directly.
      </p>
    );
  }
  return (
    <p className="text-[12.5px] text-claret">
      Email didn&apos;t go through
      {outcome.reason ? ` — ${outcome.reason}` : "."}{" "}
      <span className="text-ink-muted">
        Share the link or code below directly.
      </span>
    </p>
  );
}
