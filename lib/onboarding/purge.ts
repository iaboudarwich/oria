import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/data/audit-log";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hard-delete anything soft-deleted more than 24 hours ago. Runs from the hourly
 * cron. Children cascade via existing FKs (ON DELETE CASCADE). Audits each purged
 * row for forensics. Returns counts.
 */
export async function purgeExpiredSoftDeletes(): Promise<{ orgs: number; sections: number }> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - DAY_MS).toISOString();

  let orgs = 0;
  let sections = 0;

  const { data: orgRows } = await admin
    .from("organizations")
    .select("id, created_by, name")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);
  for (const o of (orgRows as { id: string; created_by: string | null; name: string }[] | null) ?? []) {
    await admin.from("organizations").delete().eq("id", o.id);
    orgs += 1;
    if (o.created_by) {
      void logAuditEvent({
        userId: o.created_by,
        action: "setup_change_purged",
        resourceType: "organization",
        resourceId: o.id,
        metadata: { name: o.name },
      });
    }
  }

  const { data: secRows } = await admin
    .from("custom_sections")
    .select("id, created_by, name")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);
  for (const s of (secRows as { id: string; created_by: string | null; name: string }[] | null) ?? []) {
    await admin.from("custom_sections").delete().eq("id", s.id);
    sections += 1;
    if (s.created_by) {
      void logAuditEvent({
        userId: s.created_by,
        action: "setup_change_purged",
        resourceType: "custom_section",
        resourceId: s.id,
        metadata: { name: s.name },
      });
    }
  }

  return { orgs, sections };
}
