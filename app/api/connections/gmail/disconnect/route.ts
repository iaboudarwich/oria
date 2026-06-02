import "server-only";

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/integrations/gmail/oauth";
import {
  getGmailConnectionTokens,
  deleteGmailConnection,
  purgeGmailDerivedData,
} from "@/lib/integrations/gmail/connections";
import { logAuditEvent } from "@/lib/data/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/connections/gmail/disconnect
 * Body: { deleteData?: boolean }
 *
 * Revokes Oria's access at Google and deletes the connection row (which
 * cascade-deletes detected items + scan jobs). When deleteData is true, the
 * trackables and reminders created from Gmail are removed first; otherwise
 * everything the user already approved is kept. Always audited.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const deleteData = await req
    .json()
    .then((b: { deleteData?: boolean }) => b?.deleteData === true)
    .catch(() => false);

  const conn = await getGmailConnectionTokens(user.id);
  if (!conn) return NextResponse.json({ ok: true });

  // Remove derived trackables/reminders before the cascade wipes the linkage.
  if (deleteData) {
    await purgeGmailDerivedData(user.id);
  }

  // Revoke at Google: the refresh token revokes the whole grant; fall back to
  // the access token.
  await revokeToken(conn.refreshToken ?? conn.accessToken);
  await deleteGmailConnection(user.id, conn.id);

  await logAuditEvent({
    userId: user.id,
    action: "email.disconnected",
    resourceType: "email_connection",
    metadata: { source: "gmail", email: conn.email, deleted_data: deleteData },
  });

  return NextResponse.json({ ok: true });
}
