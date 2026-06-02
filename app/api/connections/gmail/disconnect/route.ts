import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/integrations/gmail/oauth";
import {
  getGmailConnectionTokens,
  deleteGmailConnection,
} from "@/lib/integrations/gmail/connections";
import { logAuditEvent } from "@/lib/data/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/connections/gmail/disconnect
 * Revokes Oria's access at Google, deletes the connection row, and audits.
 * (Deleting derived trackables/reminders on request is handled in F5.)
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const conn = await getGmailConnectionTokens(user.id);
  if (!conn) return NextResponse.json({ ok: true });

  // Revoke at Google: the refresh token revokes the whole grant; fall back to
  // the access token.
  await revokeToken(conn.refreshToken ?? conn.accessToken);
  await deleteGmailConnection(user.id, conn.id);

  await logAuditEvent({
    userId: user.id,
    action: "email.disconnected",
    resourceType: "email_connection",
    metadata: { source: "gmail", email: conn.email },
  });

  return NextResponse.json({ ok: true });
}
