import { getLocale, getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { EmptyState } from "@/components/ui/empty-state";
import { UploadIcon } from "@/components/ui/icon";
import { CaptureBar } from "@/components/dashboard/capture-bar";
import { SpaceChips, type SpaceChip } from "@/components/dashboard/space-chips";
import { TalkCube } from "@/components/dashboard/talk-cube";
import { TodayPulse } from "@/components/dashboard/today-pulse";
import { SectionsGrid } from "@/components/dashboard/sections-grid";
import { getCurrentContext, listUserSpaces } from "@/lib/data/organizations";
import { countUploadsBySection, listUploadsWithUploader } from "@/lib/data/uploads";
import { listAllSections } from "@/lib/data/all-sections";
import { computeUserInsights } from "@/lib/data/insights";
import { readDismissedInsightIds } from "@/lib/data/insights-dismiss";
import { InsightsCard } from "@/components/dashboard/insights-card";
import { getActiveSectionSuggestion } from "@/lib/sections/suggest-sections";
import { SectionSuggestionBanner } from "@/components/dashboard/section-suggestion-banner";
import { readMfaEnrolledAt } from "@/lib/auth/mfa";
import { TwoFactorPrompt } from "@/components/dashboard/two-factor-prompt";
import { Hint } from "@/components/onboarding/hint";
import { getSeenHintKeys } from "@/lib/data/onboarding";
import { OnboardingRepromptBanner } from "@/components/dashboard/onboarding-reprompt-banner";
import { listUpcomingEvents } from "@/lib/google/calendar";
import { UpcomingEventsStrip } from "@/components/cloud/upcoming-events-strip";
import { cookies } from "next/headers";
import { getOriaTzCookieName, getLocalParts } from "@/lib/utils/tz";
import { loadDailyLoop } from "@/lib/daily/today-data";
import { DailyLoop } from "@/components/dashboard/daily/daily-loop";
import { loadContextSurface } from "@/lib/daily/context-surface";
import { ContextSurface } from "@/components/dashboard/context/context-surface";
import { loadHealthToday } from "@/lib/daily/health-today";
import { ritualsDoneToday } from "@/lib/data/rituals";
import { HealthStatCard } from "@/components/dashboard/health-stat-card";
import { currentNetWorth } from "@/lib/data/net-worth";
import { getDashboardCardPrefs } from "@/lib/data/dashboard-cards";
import { DashboardCards } from "@/components/dashboard/dashboard-cards";
import { NetWorthMiniCard } from "@/components/dashboard/net-worth-mini-card";
import { SpendMiniCard } from "@/components/dashboard/spend-mini-card";
import { Stack } from "@/components/ui/layout";
import { listBills } from "@/lib/data/smart-sections";
import { summarizeSpend } from "@/lib/sections/spend-summary";
import { defaultStatCards, resolveStatCards, type StatCardKey } from "@/lib/daily/stat-cards";
import type { ReactNode } from "react";

export default async function DashboardHome() {
  const t = await getTranslations("empty");
  const th = await getTranslations("home");
  const locale = await getLocale();
  const ctx = await getCurrentContext();

  // Onboarding hints. evaluated server-side to avoid flash.
  const seenHints = await getSeenHintKeys();
  // Show at most one hint per visit: first_upload takes priority.
  const showFirstUpload = !seenHints.has("first_upload");
  const showCreateCircle = !showFirstUpload && !seenHints.has("create_circle");

  // Section counts and section settings are independent of uploads.
  // Fetch uploads first (we need their ids for the signed-url batch),
  // but kick off section work in parallel with the URL signing so the
  // home page doesn't pay for the round-trip twice.
  const uploadsP = listUploadsWithUploader({ limit: 4 });
  const sectionCountsP = countUploadsBySection();
  const allSectionsP = listAllSections({
    includeHidden: false,
    includeReview: false,
  });
  const insightsP = computeUserInsights();
  const dismissedP = readDismissedInsightIds();
  const suggestionP = ctx ? getActiveSectionSuggestion(ctx.organization.id) : Promise.resolve(null);
  const mfaEnrolledP = ctx?.profile.id ? readMfaEnrolledAt(ctx.profile.id) : Promise.resolve(null);
  const upcomingEventsP = ctx?.profile.id
    ? listUpcomingEvents(ctx.profile.id, ctx.organization.id, 48)
    : Promise.resolve([]);
  const uploads = await uploadsP;
  const [sectionCounts, allSections, rawInsights, dismissed, suggestion] = await Promise.all([
    sectionCountsP,
    allSectionsP,
    insightsP,
    dismissedP,
    suggestionP,
  ]);
  const mfaEnrolledAt = await mfaEnrolledP;
  const upcomingEvents = await upcomingEventsP;
  const insights = rawInsights.filter((i) => !dismissed.has(i.id));
  const calT = await getTranslations("cloud");

  // Round 16: per-context surface + the intelligent daily loop. Timezone comes
  // from the client-set oria_tz cookie (fresh on every visit), falling back to
  // the stored profile timezone.
  const now = new Date();
  const cookieStore = await cookies();
  const tz =
    cookieStore.get(getOriaTzCookieName())?.value ||
    ((ctx?.profile as Record<string, unknown> | undefined)?.timezone as string | undefined) ||
    null;

  // Greeting: part-of-day from the user's local hour, in their language; the
  // serif (Fraunces) renders it via the Topbar title. Subtitle = today's date
  // (their timezone + locale) + the calm tagline.
  const localHour = getLocalParts(now, tz).hour;
  const partKey = (
    localHour < 12 ? "morning" : localHour < 18 ? "afternoon" : "evening"
  ) as "morning";
  const firstName = ctx?.profile.full_name?.trim().split(/\s+/)[0] ?? null;
  const greeting = firstName
    ? th(partKey, { name: firstName })
    : th(`${partKey}_plain` as "morning_plain");
  const dateStr = now.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: tz || undefined,
  });
  const greetingSubtitle = `${dateStr} · ${th("everything")}`;

  // Per-space switch chips (a re-lay-out of the sidebar SpaceSwitcher).
  const spaces = ctx ? await listUserSpaces() : [];
  const spaceChips: SpaceChip[] = spaces.map((s) => ({
    id: s.organization.id,
    kind: s.organization.kind,
    label:
      s.organization.kind === "personal"
        ? "Personal"
        : s.organization.kind === "office"
          ? s.organization.name.replace(/workspace/gi, "Work")
          : s.organization.name,
  }));

  const [contextSurface, dailyLoop, healthToday, ritualsToday, netWorth, cardPrefs, bills] = ctx
    ? await Promise.all([
        loadContextSurface(ctx.organization.id, ctx.organization, now),
        loadDailyLoop(ctx.profile.id, ctx.organization.id, tz, now),
        loadHealthToday(ctx.profile.id, ctx.organization.id, tz, now),
        ritualsDoneToday(),
        currentNetWorth(),
        getDashboardCardPrefs(ctx.profile.id),
        listBills(200),
      ])
    : [null, null, null, null, null, [], []];

  // Real spend aggregation (no invented budget): the home Spending ring reads
  // this month vs last month from the user's actual bills.
  const spend = summarizeSpend(bills ?? [], now);
  const spendMonthLabel = now.toLocaleDateString(locale, {
    month: "long",
    timeZone: tz || undefined,
  });

  // Today daily-stats: the tailored, per-archetype card set, narrowed to what
  // the user actually has, then ordered by their saved prefs (Round: surfaces).
  const cardNodes: Partial<Record<StatCardKey, ReactNode>> = {};
  if (contextSurface) cardNodes.context = <ContextSurface surface={contextSurface} />;
  if (healthToday || ritualsToday)
    cardNodes.health = <HealthStatCard data={healthToday} rituals={ritualsToday} />;
  if (netWorth && netWorth.totalAssets > 0)
    cardNodes.net_worth = <NetWorthMiniCard nw={netWorth} />;
  if (spend.hasData)
    cardNodes.spend = <SpendMiniCard summary={spend} monthLabel={spendMonthLabel} />;
  const cardSignals = {
    archetype: contextSurface?.archetype ?? ("personal" as const),
    hasHealth: !!healthToday,
    hasRituals: !!ritualsToday,
    hasFinance: !!netWorth && netWorth.totalAssets > 0,
    hasBills: spend.hasData,
  };
  const availableCards = defaultStatCards(cardSignals).filter((k) => cardNodes[k]);
  const resolvedCards = resolveStatCards(availableCards, cardPrefs ?? []);

  const isEmpty = uploads.length === 0;

  // Reprompt banner: show if not completed onboarding AND not dismissed
  const profile = ctx?.profile as Record<string, unknown> | undefined;
  const showReprompt =
    ctx &&
    !profile?.has_completed_guided_onboarding &&
    !profile?.onboarding_reprompt_permanent_dismiss &&
    (!profile?.onboarding_reprompt_dismissed_until ||
      new Date(profile.onboarding_reprompt_dismissed_until as string) < new Date());

  return (
    <>
      <Topbar title={greeting} subtitle={greetingSubtitle} />

      {ctx ? <TwoFactorPrompt enrolled={!!mfaEnrolledAt} /> : null}

      <Stack gap={6} className="animate-fade-up">
        {upcomingEvents.length > 0 ? (
          <UpcomingEventsStrip
            events={upcomingEvents.map((e) => ({
              id: e.id,
              title: e.title,
              location: e.location,
              startsAt: e.startsAt,
              isAllDay: e.isAllDay,
              webViewLink: e.webViewLink,
            }))}
            heading={calT("upcoming_heading")}
            dismissLabel={calT("dismiss")}
          />
        ) : null}
        {showReprompt && ctx && <OnboardingRepromptBanner />}

        {/* ONE capture entry: type -> Ask, paste -> file, drop/attach -> upload,
            mic -> voice. Replaces the old separate search / voice / paste /
            dropzone stack. */}
        <CaptureBar />

        {spaceChips.length > 1 ? (
          <SpaceChips spaces={spaceChips} activeId={ctx?.organization.id ?? ""} />
        ) : null}

        {/* "Your day": the tailored per-archetype tile grid (dials, rings,
            sparklines), reorderable + show/hide via Customize. */}
        {ctx && resolvedCards.length > 0 ? (
          <DashboardCards initial={resolvedCards} nodes={cardNodes} />
        ) : null}

        <TalkCube />

        {/* Morning briefing. */}
        {dailyLoop && ctx ? (
          <DailyLoop data={dailyLoop} organizationId={ctx.organization.id} />
        ) : null}

        {/* The day's real, time-bound agenda (reminders + connected events). */}
        <TodayPulse activeSpaceId={ctx?.organization.id ?? ""} tz={tz} />

        <InsightsCard insights={insights} />

        {suggestion ? <SectionSuggestionBanner suggestion={suggestion} /> : null}

        {/* First-run capture nudge only. The raw "Recent" uploads feed lives on
            the Uploads tab; the home stays the day (briefing + capture + the
            day's real schedule + stats), not an uploads feed. */}
        {isEmpty ? (
          <EmptyState
            icon={<UploadIcon size={22} />}
            headline={t("home_headline")}
            description={t("home_desc")}
            cta={{ label: t("home_cta"), href: "/dashboard/inbox" }}
          />
        ) : null}

        <SectionsGrid sections={allSections} counts={sectionCounts} />
      </Stack>

      <Hint
        hintKey="first_upload"
        shouldShow={showFirstUpload}
        title="Add your first file"
        body="Drop any document, receipt, or photo. Oria reads it, files it, and makes it searchable. Try dragging something onto this page."
      />
      <Hint
        hintKey="create_circle"
        shouldShow={showCreateCircle}
        title="Share a space with someone"
        body="Circles let you coordinate with family, a partner, or housemates. Create one from the circles menu and invite them by email."
      />
    </>
  );
}
