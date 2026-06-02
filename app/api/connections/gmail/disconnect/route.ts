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
 * Body: { connectionId: string, deleteData?: boolean }
 *
 * Revokes Oria's access at Google for ONE connection and deletes that row
 * (cascade-deletes its detected items + scan jobs). When deleteData is true,
 * the trackables and reminders created from THAT connection are removed first.
 * Strictly scoped to the connection id (verified to belong to the user): other
 * connected accounts are untouched. Always audited.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req
    .json()
    .then((b: { connectionId?: string; deleteData?: boolean }) => ({
      connectionId: typeof b?.connectionId === "string" ? b.connectionId : null,
      deleteData: b?.deleteData === true,
    }))
    .catch(() => ({ connectionId: null, deleteData: false }));

  if (!body.connectionId) {
    return NextResponse.json({ error: "missing_connection" }, { status: 400 });
  }

  const conn = await getGmailConnectionTokens(body.connectionId);
  // Verify ownership before touching anything.
  if (!conn || conn.userId !== user.id) return NextResponse.json({ ok: true });

  // Remove this connection's derived trackables/reminders before the cascade
  // wipes the linkage. Scoped to the connection so others are untouched.
  if (body.deleteData) {
    await purgeGmailDerivedData(user.id, conn.id);
  }

  // Revoke at Google: the refresh token revokes the whole grant; fall back to
  // the access token.
  await revokeToken(conn.refreshToken ?? conn.accessToken);
  await deleteGmailConnection(user.id, conn.id);

  await logAuditEvent({
    userId: user.id,
    action: "email.disconnected",
    resourceType: "email_connection",
    resourceId: conn.id,
    metadata: { source: "gmail", email: conn.email, deleted_data: body.deleteData },
  });

  return NextResponse.json({ ok: true });
}
