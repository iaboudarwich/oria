import { CheckIcon } from "@/components/ui/icon";
import type { EmailStatus } from "@/lib/data/circle-actions";

/**
 * Tiny inline status under the invite-creator success state + the resend
 * action. Keeps wording calm, never alarming.
 */
export function EmailStatusLine({
  status,
  recipient,
}: {
  status: EmailStatus;
  recipient: string;
}) {
  if (status === "sent") {
    return (
      <p className="flex items-center gap-1.5 text-[12.5px] text-[#3f5240]">
        <CheckIcon size={12} /> Email sent to {recipient}
      </p>
    );
  }
  if (status === "skipped") {
    return (
      <p className="text-[12.5px] text-ink-muted">
        Email isn&apos;t set up yet. Share the link or code below directly.
      </p>
    );
  }
  return (
    <p className="text-[12.5px] text-claret">
      Email didn&apos;t go through. Share the link or code below directly.
    </p>
  );
}
