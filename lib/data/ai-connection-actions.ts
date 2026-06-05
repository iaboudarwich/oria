"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  clearPendingAiNotice,
  setReasoningMode,
  setActiveAiConnection,
  removeAiConnection,
  type ReasoningMode,
} from "./ai-connections";
import { logAuditEvent } from "./audit-log";

/** Dismiss the one-time AI fallback notice after the toast is shown. */
export async function dismissAiNotice(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await clearPendingAiNotice(user.id);
}

/** Save the user's Ask Oria reasoning preference. */
export async function updateReasoningMode(mode: ReasoningMode): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await setReasoningMode(user.id, mode);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/ask");
}

/** Pick which connected AI account powers Ask Oria. */
export async function chooseActiveAiConnection(connectionId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const ok = await setActiveAiConnection(user.id, connectionId);
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/ask");
  return { ok };
}

/** Remove one connected AI account. Audited. */
export async function disconnectAiConnection(connectionId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const res = await removeAiConnection(user.id, connectionId);
  if (res.ok) {
    await logAuditEvent({
      userId: user.id,
      action: "ai_connection_removed",
      resourceType: "ai_connection",
      metadata: { provider: res.provider },
    });
  }
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/ask");
  return { ok: res.ok };
}
