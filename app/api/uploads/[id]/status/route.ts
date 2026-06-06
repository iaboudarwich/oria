import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContext } from "@/lib/data/organizations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Poll-friendly upload status. The Dropzone hits this after a successful
 * upload to surface a calm "I found N items" message once Claude has read
 * the file. RLS scopes by org, so users can only poll their own uploads.
 *
 *   GET /api/uploads/:id/status
 *   → { status, items_count, sorted_count, unsorted_count }
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const uploadRes = await supabase
    .from("uploads")
    .select("status")
    .eq("id", id)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  const upload = uploadRes.data as { status: string } | null;
  if (!upload) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Count items + how many were auto-sorted (section is not null).
  const [allRes, sortedRes] = await Promise.all([
    supabase
      .from("memory_items")
      .select("*", { count: "exact", head: true })
      .eq("upload_id", id)
      .is("deleted_at", null),
    supabase
      .from("memory_items")
      .select("*", { count: "exact", head: true })
      .eq("upload_id", id)
      .is("deleted_at", null)
      .not("section", "is", null),
  ]);
  const items_count = allRes.count ?? 0;
  const sorted_count = sortedRes.count ?? 0;
  const unsorted_count = Math.max(0, items_count - sorted_count);

  return NextResponse.json(
    {
      status: upload.status,
      items_count,
      sorted_count,
      unsorted_count,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
