import "server-only";

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { savePushSubscription, deletePushSubscription } from "@/lib/data/push-subscriptions";
import { logAuditEvent } from "@/lib/data/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IncomingSubscription = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

/** POST: store (upsert) the current user's push subscription. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: IncomingSubscription;
  try {
    body = (await request.json()) as IncomingSubscription;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const userAgent = (await headers()).get("user-agent");
  const ok = await savePushSubscription({
    userId: user.id,
    endpoint,
    p256dh,
    auth,
    userAgent,
  });
  if (!ok) return NextResponse.json({ ok: false }, { status: 500 });

  await logAuditEvent({
    userId: user.id,
    action: "push.subscribed",
    resourceType: "push_subscription",
  });
  return NextResponse.json({ ok: true });
}

/** DELETE: remove a subscription by endpoint. */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { endpoint?: unknown };
  try {
    body = (await request.json()) as { endpoint?: unknown };
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body.endpoint !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  await deletePushSubscription(body.endpoint);
  await logAuditEvent({
    userId: user.id,
    action: "push.unsubscribed",
    resourceType: "push_subscription",
  });
  return NextResponse.json({ ok: true });
}
