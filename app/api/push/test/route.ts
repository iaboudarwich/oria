import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/data/admin";
import { isPushConfigured, sendPushToUser } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Dev/admin-gated test push. Sends a generic notification to the CURRENT
 * user's own subscriptions. Never publicly callable: it requires an
 * authenticated session AND either development mode or an admin email
 * (ADMIN_EMAILS). It cannot target another user.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const allowed = process.env.NODE_ENV !== "production" || (await isCurrentUserAdmin());
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!isPushConfigured()) {
    return NextResponse.json({ ok: false, error: "push_unconfigured" }, { status: 503 });
  }

  // Generic payload only — no personal data. Specifics are fetched in-app.
  const result = await sendPushToUser(user.id, {
    title: "Oria",
    body: "Test notification. Push is working.",
    url: "/dashboard",
    tag: "oria-test",
  });

  return NextResponse.json({ ok: true, ...result });
}
