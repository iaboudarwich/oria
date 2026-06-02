"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  deleteCloudConnection,
  setCloudConnectionStatus,
  updateCloudConnectionRouting,
  getCloudConnection,
  type CloudConnectionStatus,
} from "./cloud-connections";
import { logAuditEvent } from "@/lib/data/audit-log";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Disconnect (revoke + delete) one cloud connection. */
export async function cloudDisconnect(connectionId: string): Promise<void> {
  const user = await requireUser();
  if (!user) return;
  const conn = await getCloudConnection(user.id, connectionId);
  if (!conn) return;
  const ok = await deleteCloudConnection(user.id, connectionId);
  if (ok) {
    await logAuditEvent({
      userId: user.id,
      action: "cloud.disconnected",
      resourceType: "cloud_connection",
      resourceId: connectionId,
      metadata: { provider: "google", service: conn.service, account_email: conn.accountEmail },
    });
  }
  revalidatePath("/dashboard/settings");
}

/** Pause or resume one cloud connection. */
export async function cloudSetStatus(
  connectionId: string,
  status: CloudConnectionStatus,
): Promise<void> {
  const user = await requireUser();
  if (!user) return;
  await setCloudConnectionStatus(user.id, connectionId, status);
  revalidatePath("/dashboard/settings");
}

/** Update one cloud connection's routing (auto, or fixed to one space). */
export async function cloudUpdateRouting(
  connectionId: string,
  mode: "auto" | "fixed",
  targetOrgId: string | null,
): Promise<void> {
  const user = await requireUser();
  if (!user) return;
  await updateCloudConnectionRouting(
    user.id,
    connectionId,
    mode,
    mode === "fixed" && targetOrgId ? [targetOrgId] : [],
  );
  revalidatePath("/dashboard/settings");
}
