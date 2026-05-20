import { NextResponse } from "next/server";
import { liveSearch } from "@/lib/data/global-search";
import { getCurrentContext } from "@/lib/data/organizations";
import { recordLearningEvent } from "@/lib/data/learning";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const results = await liveSearch(q);

  // Record the query for future retrieval-quality work. Skip very short
  // queries (most are mid-typing). Never blocks the response.
  if (q.trim().length >= 3) {
    void recordLearningEvent({
      organizationId: ctx.organization.id,
      actorId: ctx.profile.id,
      kind: "search.queried",
      payload: {
        q: q.trim().slice(0, 120),
        hits: {
          uploads: results.uploads.length,
          sections: results.sections.length,
          reminders: results.reminders.length,
          pages: results.pages.length,
        },
      },
    });
  }

  return NextResponse.json(results, {
    headers: {
      // Tiny private cache; keystrokes that repeat (typo correction) skip the DB.
      "Cache-Control": "private, max-age=5",
    },
  });
}
