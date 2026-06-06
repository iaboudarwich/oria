import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Web Push subscription storage (push_subscriptions, migration 0070).
 *
 * User-facing writes (save/delete) go through the RLS-scoped server client so a
 * user can only ever touch their own rows. The send path reads a target user's
 * subscriptions through the service-role admin client because it can run from a
 * context with no user session (a background job, the test trigger, etc.).
 */

export type StoredPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** Upsert the current user's subscription (keyed by endpoint). RLS-scoped. */
export async function savePushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  return !error;
}

/** Delete one of the current user's subscriptions by endpoint. RLS-scoped. */
export async function deletePushSubscription(endpoint: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return !error;
}

/** All subscriptions for a user (service-role; used by the send path). */
export async function getSubscriptionsForUser(userId: string): Promise<StoredPushSubscription[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", userId);
  return (data ?? []) as StoredPushSubscription[];
}

/** Remove a dead endpoint (called when the push service returns 404/410). */
export async function removeSubscriptionByEndpoint(endpoint: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
}
