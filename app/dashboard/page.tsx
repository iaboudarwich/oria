import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { EmptyState } from "@/components/ui/empty-state";
import { UploadIcon } from "@/components/ui/icon";
import { DropzoneCompact } from "@/components/upload/dropzone-compact";
import { Thumbnail } from "@/components/upload/thumbnail";
import { SearchHero } from "@/components/dashboard/search-hero";
import { TodayPulse } from "@/components/dashboard/today-pulse";
import { SectionsGrid } from "@/components/dashboard/sections-grid";
import { getCurrentContext } from "@/lib/data/organizations";
import {
  countUploadsBySection,
  getSignedUrlMap,
  listUploadsWithUploader,
  type UploadWithUploader,
} from "@/lib/data/uploads";
import { listAllSections } from "@/lib/data/all-sections";
import { displayActor } from "@/lib/data/timeline";
import { sectionLabel } from "@/lib/sections-meta";
import { relativeTime } from "@/lib/utils";
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
import type { Section } from "@/lib/supabase/types";

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
  const uploads = await uploadsP;
  const [sectionCounts, allSections, thumbs, rawInsights, dismissed, suggestion] =
    await Promise.all([
      sectionCountsP,
      allSectionsP,
      getSignedUrlMap(
        uploads.map((u) => ({ id: u.id, storage_path: u.storage_path })),
      ),
      insightsP,
      dismissedP,
      suggestionP,
    ]);
  const mfaEnrolledAt = await mfaEnrolledP;
  const insights = rawInsights.filter((i) => !dismissed.has(i.id));

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
        {showReprompt && ctx && <OnboardingRepromptBanner />}
        <SearchHero />

        <QuickActions />

        <AddRow />

        <TodayPulse activeSpaceId={ctx?.organization.id ?? ""} />

        <InsightsCard insights={insights} />

        {suggestion ? <SectionSuggestionBanner suggestion={suggestion} /> : null}

        {isEmpty ? (
          <EmptyState
            icon={<UploadIcon size={22} />}
            headline={t("home_headline")}
            description={t("home_desc")}
            cta={{ label: t("home_cta"), href: "/dashboard/inbox" }}
          />
        ) : (
          <Recent uploads={uploads} thumbs={thumbs} />
        )}

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

function Recent({
  uploads,
  thumbs,
}: {
  uploads: UploadWithUploader[];
  thumbs: Map<string, string>;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-medium text-ink-muted">Recent</h2>
        <Link
          href="/dashboard/timeline"
          className="text-[12px] text-ink-faint hover:text-ink transition-base"
        >
          Timeline
        </Link>
      </div>
      <ul className="space-y-0.5">
        {uploads.map((u) => (
          <li key={u.id}>
            <Link
              href={`/dashboard/uploads/${u.id}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 transition-base hover:bg-surface-raised"
            >
              <Thumbnail
                mime={u.mime_type}
                imageUrl={thumbs.get(u.id) ?? null}
                filename={u.filename}
                size={32}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-ink">
                  {u.title ?? u.filename}
                </p>
                <p className="truncate text-[11.5px] text-ink-faint">
                  {displayActor(u.uploader)} ·{" "}
                  {sectionLabel(u.section as Section | null)} ·{" "}
                  {relativeTime(u.created_at)}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
