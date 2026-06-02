"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { logAuditEvent } from "@/lib/data/audit-log";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Pause or resume one Outlook mailbox. */
export async function outlookSetStatus(
  connectionId: string,
  status: "active" | "paused",
): Promise<void> {
  const user = await requireUser();
  if (!user) return;
  const admin = createAdminClient();
  await admin
    .from("email_connections")
    .update({ status })
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .eq("provider", "outlook");
  revalidatePath("/dashboard/settings");
}

/** Disconnect one Outlook mailbox (deletes the connection + its detected items
 *  cascade). Microsoft delegated tokens are revoked from the account. */
export async function outlookDisconnect(connectionId: string): Promise<void> {
  const user = await requireUser();
  if (!user) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_connections")
    .select("email_address")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .eq("provider", "outlook")
    .maybeSingle();
  if (!data) return;
  await admin
    .from("email_connections")
    .delete()
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .eq("provider", "outlook");
  await logAuditEvent({
    userId: user.id,
    action: "email.disconnected",
    resourceType: "email_connection",
    resourceId: connectionId,
    metadata: { source: "outlook", email: (data as { email_address: string }).email_address },
  });
  revalidatePath("/dashboard/settings");
}
