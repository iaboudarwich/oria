import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exportAuditLog } from "@/lib/data/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/account/audit-export
 *
 * Authenticated. Returns the signed-in user's complete audit log as a
 * JSON file. Distinct from /api/account/export (full account data
 * dump): this surface is just the security event feed, useful to
 * archive before disabling 2FA or wiping the account.
 *
 * Not rate-limited (cheap, idempotent, read-only). RLS on the
 * audit_log table prevents reading anyone else's rows even via the
 * cookie-bound client; we additionally pass user.id explicitly so the
 * service-role helper can't be tricked by a missing predicate.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const events = await exportAuditLog(user.id);
  const body = JSON.stringify(
    {
      user_id: user.id,
      exported_at: new Date().toISOString(),
      event_count: events.length,
      events,
    },
    null,
    2,
  );
  const date = new Date().toISOString().slice(0, 10);
  const filename = `oria-audit-${user.id.slice(0, 8)}-${date}.json`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
