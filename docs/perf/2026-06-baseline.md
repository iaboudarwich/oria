# Performance baseline — June 2026

Status: partial. The runtime metrics below must be captured against
production (heyoria.com); they cannot be measured from the build
environment. The static analysis and the fixes shipped this round are
complete and listed at the bottom.

## How to capture the runtime numbers

1. TTFB / TTI / LCP per page: run Lighthouse (Chrome DevTools, "Performance",
   mobile + desktop) against each URL below while signed in, or use
   `npx unlighthouse --site https://heyoria.com`. Record the median of 3 runs.
2. Sum of synchronous JS on first load per route: Chrome DevTools, Coverage
   tab, or the Network tab filtered to JS for a hard reload of each page.
3. Slowest API endpoints by p95: Vercel dashboard, Observability, Functions
   (sort by p95), or Sentry Performance, transactions filtered to `/api/*`.

## Pages to measure

| Page | URL | TTFB | TTI | LCP | First-load JS |
|---|---|---|---|---|---|
| Dashboard home | /dashboard | _measure_ | _measure_ | _measure_ | _measure_ |
| Settings | /dashboard/settings | _measure_ | _measure_ | _measure_ | _measure_ |
| Calendar | /dashboard/calendar | _measure_ | _measure_ | _measure_ | _measure_ |
| Things | /dashboard/things | _measure_ | _measure_ | _measure_ | _measure_ |
| Ask Oria | /dashboard/ask | _measure_ | _measure_ | _measure_ | _measure_ |

## Slowest 5 API endpoints (p95)

| Endpoint | p95 (ms) | Notes |
|---|---|---|
| _from Vercel/Sentry_ | | |

(Expected likely offenders from code review: `/api/ask` and `/api/work/agent`
are inherently slow because they stream an LLM response; the relevant metric
there is time-to-first-token, not total. `/api/uploads` does file IO +
queueing. The dashboard RSC render itself is the more interesting target.)

## Static analysis findings (from code, no prod access needed)

1. N+1 query in `countUploadsBySection` (lib/data/uploads.ts). It ran one
   `count` query per builtin section (10 round trips) on every Dashboard home
   and Inbox render. FIXED this round: one query that pulls the `section`
   column for the org's live uploads and tallies in memory. Delta: 10 DB
   round trips -> 1 on two of the highest-traffic pages.

2. `getCurrentContext` is already wrapped in `React.cache()`, so the
   profile/org/membership reads are de-duplicated per request across the many
   server components that call it (layout, topbar, pages, retrieval). No
   change needed; verified.

3. Per-render admin read in the dashboard layout for the beta-disclaimer flag.
   Cheap and gated, left as-is; a candidate to fold into the cached context if
   measurement shows the layout is a bottleneck.

## Candidate fixes to apply once measurement confirms

- If first-load JS is high on a route, audit for client components that have
  no interactivity and convert them to server components.
- Ensure `prefetch` stays on for the highest-traffic sidebar destinations
  (Next prefetches `<Link>` by default; only `/security` opts out, which is
  correct).
- Add Supabase indexes for any endpoint that shows up slow in p95 and lacks
  index coverage on its filter columns.
- Consider `React.cache()` / the Next data cache on `listAllSections` and
  `countUploadsBySection` if the dashboard render is hot.

## Fixes shipped this round

- countUploadsBySection: 10 queries -> 1 (above).
- Smart deploy strategy (separate from latency, but part of perceived
  reliability): /api/version + a client VersionWatcher that polls every 5
  minutes, shows a non-blocking "New version available" toast, and
  auto-refreshes after 60 minutes idle when no upload is in flight and no
  text field has unsaved input.
