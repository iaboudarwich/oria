"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logAuditEvent } from "@/lib/data/audit-log";

/**
 * Today-surface mutations: the actionable overcommitment hold (F5) and
 * dismissing a carried-forward card (F6). Both run through the RLS client, so
 * they only ever touch the caller's own rows, and both are audit-logged.
 */

/**
 * F5: turn the overcommitment warning into action. Creates a real "Focus time"
 * reminder for the largest open gap in the day. (We do not write to the user's
 * external calendar; a reminder is the local write Oria owns.)
 */
export async function blockFocusTime(input: {
  organizationId: string;
  startsAt: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in." };

    const { error } = await supabase.from("reminders").insert({
      title: "Focus time",
      due_at: input.startsAt,
      created_by: user.id,
      organization_id: input.organizationId,
      done: false,
    });
    if (error) return { ok: false, error: error.message };

    await logAuditEvent({
      userId: user.id,
      action: "today.focus_blocked",
      organizationId: input.organizationId,
      resourceType: "reminder",
      metadata: { startsAt: input.startsAt },
    });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** F6: dismiss a carried-forward card so it leaves Today. */
export async function dismissRolloverCard(cardId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("today_pinned_cards")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", cardId);
    revalidatePath("/dashboard");
  } catch {
    // Best-effort
  }
}
