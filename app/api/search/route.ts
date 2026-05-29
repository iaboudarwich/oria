import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { liveSearch } from "@/lib/data/global-search";
import { getCurrentContext } from "@/lib/data/organizations";
import { recordLearningEvent } from "@/lib/data/learning";
import { rateLimit, RATE_PRESETS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await getCurrentContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Search fires on every keystroke past 3 chars, so we allow a high
  // per-minute ceiling but still bounce obvious scraping. Soft fail.
  // a 429 here surfaces in the UI as "Search hiccup" via the cache.
  const burst = rateLimit({
    key: `search:${ctx.profile.id}`,
    ...RATE_PRESETS.search(),
  });
  if (!burst.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: burst.message },
      {
        status: 429,
        headers: { "Retry-After": String(burst.retryAfterSeconds) },
      },
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";

  let results: Awaited<ReturnType<typeof liveSearch>>;
  try {
    results = await liveSearch(q);
  } catch (e) {
    Sentry.captureException(e, {
      tags: { surface: "search" },
      extra: { orgId: ctx.organization.id, actorId: ctx.profile.id },
    });
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }

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
