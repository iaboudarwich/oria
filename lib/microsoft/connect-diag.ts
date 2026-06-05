import "server-only";

import { recordSystemEvent } from "@/lib/data/system-events";

/**
 * Per-step connect diagnostics for the Outlook / Microsoft Graph flow, the same
 * "no invisible failures" discipline applied to WHOOP. Records the precise
 * failing step to the operator system log (NEVER to the user, who always sees
 * plain copy). Carries PRESENCE booleans and provider error CODES only, never a
 * secret or token value.
 *
 * Steps: oauth_unconfigured / state_verify / token_exchange / profile_fetch /
 * db_write / admin_consent / provider_denied.
 */
export async function diagOutlook(
  step: string,
  context: Record<string, unknown>,
  actorId?: string | null,
): Promise<void> {
  console.error("[outlook-connect-failed]", step, context);
  await recordSystemEvent({
    kind: "outlook.connect_failed",
    severity: "warn",
    message: `Outlook connect failed at: ${step}`,
    context: { step, ...context },
    actorId: actorId ?? null,
  });
}

/**
 * Classify a Microsoft authorize/redirect error. The error_description is a
 * Microsoft AADSTS string; we read it ONLY to decide which plain message to
 * show and to log the AADSTS code (not a secret). It is never surfaced raw.
 *
 * Managed-tenant signals: AADSTS90094 (admin consent required), AADSTS65001
 * (consent not granted, often admin-gated on work/school tenants), or an
 * explicit consent_required error.
 */
export function classifyMicrosoftError(
  error: string | null,
  description: string | null,
): { adminConsent: boolean; aadsts: string | null } {
  const d = (description ?? "").toLowerCase();
  const aadsts = (description ?? "").match(/AADSTS\d+/i)?.[0] ?? null;
  const adminConsent =
    error === "consent_required" ||
    d.includes("aadsts90094") ||
    d.includes("aadsts65001") ||
    d.includes("admin consent") ||
    d.includes("administrator has not consented") ||
    d.includes("needs admin approval");
  return { adminConsent, aadsts };
}
