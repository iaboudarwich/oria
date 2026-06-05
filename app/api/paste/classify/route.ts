import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/data/organizations";
import { classifyPaste, shouldOfferPaste } from "@/lib/ai/smart-paste";
import { sectionLabel } from "@/lib/sections-meta";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";
import type { Section } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Smart-paste classification. The client posts a pasted block; we return whether
 * to OFFER filing and where ({ offer, section, sectionLabel, documentType,
 * title }). Nothing is filed here; the user confirms separately.
 */
export async function POST(request: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { text?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!shouldOfferPaste(text)) {
    return NextResponse.json({ offer: false });
  }

  const burst = rateLimit({ key: `paste:${ctx.profile.id}`, ...RATE_PRESETS.upload() });
  if (!burst.ok) return NextResponse.json({ offer: false });

  const cls = await classifyPaste(ctx.profile.id, text);
  if (cls.kind !== "file" || !cls.section) {
    return NextResponse.json({ offer: false });
  }

  return NextResponse.json({
    offer: true,
    section: cls.section,
    sectionLabel: sectionLabel(cls.section as Section),
    documentType: cls.documentType,
    title: cls.title,
  });
}
