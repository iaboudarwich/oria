import "server-only";

import webpush from "web-push";
import {
  getSubscriptionsForUser,
  removeSubscriptionByEndpoint,
} from "@/lib/data/push-subscriptions";

/**
 * Web Push send path (VAPID).
 *
 * Reads the three VAPID env vars (NEXT_PUBLIC_VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, VAPID_SUBJECT). If any is missing, push is disabled
 * gracefully: isPushConfigured() returns false and sendPushToUser() reports
 * { configured: false } instead of throwing, so the app never crashes on a
 * server without push set up.
 *
 * PRIVACY: payloads are intentionally generic. Push transits Apple/Google/
 * Mozilla services, so we never put financial, health, document, or other
 * personal detail in the body. The notification points at a URL; the app
 * fetches the specifics in-app when the user taps.
 */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT;

let configured = false;
if (PUBLIC_KEY && PRIVATE_KEY && SUBJECT) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
}

export function isPushConfigured(): boolean {
  return configured;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type SendResult = {
  configured: boolean;
  sent: number;
  failed: number;
  removed: number;
};

/**
 * Send a generic notification to every subscription a user has. Dead endpoints
 * (404/410 from the push service) are pruned. Never throws on per-endpoint
 * failure; aggregates the outcome.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<SendResult> {
  if (!configured) return { configured: false, sent: 0, failed: 0, removed: 0 };

  const subs = await getSubscriptionsForUser(userId);
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
    tag: payload.tag ?? "oria",
  });

  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await removeSubscriptionByEndpoint(sub.endpoint);
          removed += 1;
        }
        failed += 1;
      }
    }),
  );

  return { configured: true, sent, failed, removed };
}
