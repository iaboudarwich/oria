"use server";

import { requireContext } from "./organizations";
import { logFromText } from "./text-log-actions";
import { logAuditEvent } from "./audit-log";
import type { Section } from "@/lib/supabase/types";

const BUILTIN_SECTIONS: Section[] = [
  "household",
  "travel",
  "properties",
  "staff",
  "events",
  "finance",
  "legal",
  "personal",
  "vendors",
  "health",
];

/**
 * Confirm a smart-paste: file the pasted text into the chosen section through
 * the SAME extraction pipeline as a typed log (logFromText), so a pasted flight
 * email becomes a real travel item with its dates on the calendar. Audited.
 * The user has already confirmed the section, so we pass it as the hint.
 */
export async function confirmPaste(input: {
  text: string;
  section: string;
  timezone?: string;
  nowISO?: string;
}): Promise<{ ok: true; summary: string } | { ok: false; error: string }> {
  const ctx = await requireContext();
  const section = BUILTIN_SECTIONS.includes(input.section as Section)
    ? (input.section as Section)
    : null;
  if (!section) return { ok: false, error: "Pick where to file it." };

  const res = await logFromText({
    text: input.text,
    section,
    timezone: input.timezone,
    nowISO: input.nowISO,
  });
  if (!res.ok) return { ok: false, error: res.error };

  await logAuditEvent({
    userId: ctx.profile.id,
    action: "paste.filed",
    organizationId: ctx.organization.id,
    resourceType: "memory_item",
    resourceId: res.itemIds[0] ?? null,
    metadata: { section, count: res.count },
  });
  return { ok: true, summary: res.summary };
}
