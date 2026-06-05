import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { EmptyState } from "@/components/ui/empty-state";
import { UploadIcon } from "@/components/ui/icon";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { SmartPaste } from "@/components/paste/smart-paste";
import { SearchHero } from "@/components/dashboard/search-hero";
import { TodayPulse } from "@/components/dashboard/today-pulse";
import { SectionsGrid } from "@/components/dashboard/sections-grid";
import { getCurrentContext } from "@/lib/data/organizations";
import {
  countUploadsBySection,
  listUploadsWithUploader,
} from "@/lib/data/uploads";
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
import { QuickActions } from "@/components/dashboard/quick-actions";
import { listUpcomingEvents } from "@/lib/google/calendar";
import { UpcomingEventsStrip } from "@/components/cloud/upcoming-events-strip";
import { cookies } from "next/headers";
import { getOriaTzCookieName } from "@/lib/utils/tz";
import { loadDailyLoop } from "@/lib/daily/today-data";
import { DailyLoop } from "@/components/dashboard/daily/daily-loop";
import { loadContextSurface } from "@/lib/daily/context-surface";
import { ContextSurface } from "@/components/dashboard/context/context-surface";
import { loadHealthToday } from "@/lib/daily/health-today";
import { ritualsDoneToday } from "@/lib/data/rituals";
import { HealthStatCard } from "@/components/dashboard/health-stat-card";

export default async function DashboardHome() {
  const t = await getTranslations("empty");
  const ctx = await getCurrentContext();
  const greeting = ctx?.profile.full_name
    ? `Hi, ${ctx.profile.full_name.split(" ")[0]}`
    : "Hi";

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
  const suggestionP = ctx
    ? getActiveSectionSuggestion(ctx.organization.id)
    : Promise.resolve(null);
  const mfaEnrolledP = ctx?.profile.id
    ? readMfaEnrolledAt(ctx.profile.id)
    : Promise.resolve(null);
  const upcomingEventsP =
    ctx?.profile.id
      ? listUpcomingEvents(ctx.profile.id, ctx.organization.id, 48)
      : Promise.resolve([]);
  const uploads = await uploadsP;
  const [sectionCounts, allSections, rawInsights, dismissed, suggestion] =
    await Promise.all([
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
  const [contextSurface, dailyLoop, healthToday, ritualsToday] = ctx
    ? await Promise.all([
        loadContextSurface(ctx.organization.id, ctx.organization, now),
        loadDailyLoop(ctx.profile.id, ctx.organization.id, tz, now),
        loadHealthToday(ctx.profile.id, ctx.organization.id, tz, now),
        ritualsDoneToday(),
      ])
    : [null, null, null, null];

  const isEmpty = uploads.length === 0;

  // Reprompt banner: show if not completed onboarding AND not dismissed
  const profile = ctx?.profile as Record<string, unknown> | undefined;
  const showReprompt =
    ctx &&
    !profile?.has_completed_guided_onboarding &&
    !profile?.onboarding_reprompt_permanent_dismiss &&
    (
      !profile?.onboarding_reprompt_dismissed_until ||
      new Date(profile.onboarding_reprompt_dismissed_until as string) < new Date()
    );

  return (
    <>
      <Topbar title={greeting} />

      {ctx ? <TwoFactorPrompt enrolled={!!mfaEnrolledAt} /> : null}

      <div className="space-y-7 animate-fade-up">
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
        <SearchHero />

        {contextSurface ? <ContextSurface surface={contextSurface} /> : null}

        {healthToday || ritualsToday ? (
          <HealthStatCard data={healthToday} rituals={ritualsToday} />
        ) : null}

        <QuickActions />

        {dailyLoop && ctx ? (
          <DailyLoop data={dailyLoop} organizationId={ctx.organization.id} />
        ) : null}

        <AddRow />

        <SmartPaste />

        <TodayPulse activeSpaceId={ctx?.organization.id ?? ""} />

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
      </div>

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

function AddRow() {
  return <DropzoneCompact />;
}
