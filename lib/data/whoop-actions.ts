"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { deleteWhoopConnection } from "@/lib/whoop/connections";
import { logAuditEvent } from "@/lib/data/audit-log";

/** Disconnect WHOOP: revoke the grant at WHOOP and delete the connection. The
 *  health history already collected stays (it's the user's own data). */
export async function disconnectWhoop(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await deleteWhoopConnection(user.id);
  await logAuditEvent({
    userId: user.id,
    action: "whoop.disconnected",
    resourceType: "whoop_connection",
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/health");
}
