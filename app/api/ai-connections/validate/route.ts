import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAdapter, type ProviderName } from "@/lib/ai-providers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isProvider(v: unknown): v is ProviderName {
  return v === "anthropic" || v === "openai" || v === "gemini";
}

/**
 * POST /api/ai-connections/validate
 * Validate a candidate key with a tiny live call. Does NOT save. Returns
 * { valid, status, error?, model? }.
 */
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
  return NextResponse.json(result);
}
