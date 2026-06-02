import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAdapter, type ProviderName } from "@/lib/ai-providers";
import {
  getAiConnection,
  upsertAiConnection,
  deleteAiConnection,
} from "@/lib/data/ai-connections";
import { logAuditEvent } from "@/lib/data/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isProvider(v: unknown): v is ProviderName {
  return v === "anthropic" || v === "openai" || v === "gemini";
}

/** GET: the user's current connection (no key), or null. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ connection: await getAiConnection(user.id) });
}

/** POST: validate + store a key, replacing any existing connection. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { provider?: unknown; apiKey?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!isProvider(body.provider) || typeof body.apiKey !== "string" || !body.apiKey.trim()) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = await buildAdapter(body.provider, body.apiKey).validateKey();
  if (!result.valid) {
    return NextResponse.json({ ok: false, status: result.status, error: result.error });
  }

  const saved = await upsertAiConnection({ userId: user.id, provider: body.provider, apiKey: body.apiKey });
  if (!saved) return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });

  await logAuditEvent({
    userId: user.id,
    action: "ai_connection_added",
    resourceType: "ai_connection",
    metadata: { provider: body.provider },
  });
  return NextResponse.json({ ok: true, provider: body.provider, status: "active" });
}

/** DELETE: remove the user's connection. */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const existing = await getAiConnection(user.id);
  await deleteAiConnection(user.id);
  if (existing) {
    await logAuditEvent({
      userId: user.id,
      action: "ai_connection_removed",
      resourceType: "ai_connection",
      metadata: { provider: existing.provider },
    });
  }
  return NextResponse.json({ ok: true });
}
