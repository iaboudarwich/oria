import "server-only";

import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/feedback
 *
 * Receives a user-submitted problem report from the Report-a-problem
 * dialog and forwards it to Sentry as a captured message tagged
 * `user_feedback`. Works whether or not the caller is signed in (the
 * error boundary can surface this dialog before auth resolves).
 *
 * Body: { text: string, context?: Record<string, unknown> }
 * Always returns 200 on a well-formed request: the dialog is best-effort
 * and we never want the reporter itself to throw at the user.
 */
export async function POST(request: Request) {
  let body: { text?: unknown; context?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "empty report" }, { status: 400 });
  }
  // Cap length so a runaway client can't ship a novel into our issue tracker.
  const message = text.slice(0, 2000);

  // Best-effort identity for the rate-limit key. Anonymous reports are
  // fine; we just bucket them together.
  let userId = "anon";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) userId = user.id;
  } catch {
    // No session context available; treat as anonymous.
  }

  const rl = rateLimit({
    key: `feedback:${userId}`,
    limit: 10,
    windowMs: 60 * 60_000,
    label: "problem reports",
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: rl.message },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const context =
    body.context && typeof body.context === "object"
      ? (body.context as Record<string, unknown>)
      : {};

  Sentry.captureMessage(message, {
    level: "info",
    tags: { source: "user_feedback" },
    extra: { ...context, reporterId: userId },
  });
  await Sentry.flush(2000);

  return NextResponse.json({ ok: true });
}
