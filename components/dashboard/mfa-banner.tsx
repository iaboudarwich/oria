import Link from "next/link";

type Props = {
  /** Whether the current user owns at least one Workspace (office org). */
  ownsAnyWorkspace: boolean;
  /** Whether the current user has finished MFA enrollment. */
  mfaEnrolled: boolean;
};

/**
 * Soft requirement: when a Workspace owner has not enrolled in 2FA we
 * show a calm persistent banner at the top of every dashboard page
 * encouraging it. The banner is informational; it does NOT block any
 * action. Once they enroll, the banner disappears (the layout reads
 * mfa_enrolled_at on every render — force-dynamic already).
 *
 * Personal-only accounts don't see this. The threat model is asymmetric:
 * a Workspace stores other people's documents (tenants, vendors,
 * employees), so the blast radius of a single account compromise is
 * larger than a Personal space's own files.
 */
export function MfaBanner({ ownsAnyWorkspace, mfaEnrolled }: Props) {
  if (!ownsAnyWorkspace || mfaEnrolled) return null;
  return (
    <div className="-mx-4 mb-4 border-b border-brand/20 bg-brand-soft/50 px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[12.5px] text-ink">
          <span className="font-medium">Add two-factor authentication</span>{" "}
          <span className="text-ink-muted">
            to protect this Workspace. Recommended for owners.
          </span>
        </p>
        <Link
          href="/dashboard/settings?tab=security"
          className="text-[12.5px] font-medium text-brand hover:opacity-80 transition-base"
        >
          Set up 2FA →
        </Link>
      </div>
    </div>
  );
}
