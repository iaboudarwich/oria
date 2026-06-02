import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { SidebarShell } from "@/components/dashboard/sidebar-shell";
import { CommandPalette } from "@/components/command/command-palette";
import { TimezoneCookie } from "@/components/section/timezone-cookie";
import {
  getCurrentContext,
  listUserSpaces,
} from "@/lib/data/organizations";
import { listAllSections } from "@/lib/data/all-sections";
import { countReviewUploads } from "@/lib/data/sections";
import {
  readSectionsMode,
  readSidebarExtras,
  readSidebarMode,
  readSidebarWidth,
} from "@/lib/data/sidebar-prefs";
import { kindsForMode, modeForOrgKind } from "@/lib/data/mode";
import { isCurrentUserAdmin } from "@/lib/data/admin";
import { resolveThingsLabel } from "@/lib/data/things-label";
import { resolveSpaceTheme, themeCssVars } from "@/lib/data/space-theme";
import { VersionWatcher } from "@/components/system/version-watcher";
import { readMfaEnrolledAt } from "@/lib/auth/mfa";
import { MfaBanner } from "@/components/dashboard/mfa-banner";
import { BetaDisclaimerModal } from "@/components/dashboard/beta-disclaimer-modal";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "Oria",
};

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect(
      "/login?notice=" +
        encodeURIComponent("Add Supabase keys to .env.local to use the app."),
    );
  }
  const ctx = await getCurrentContext();
  if (!ctx) redirect("/login");

  // New-user onboarding: if the active org (personal) hasn't had a template
  // chosen yet, redirect to the template picker. We check template_key === null
  // (or undefined when migration hasn't run). Existing users are unaffected.
  const templateKey = ctx.organization.template_key;
  if (ctx.organization.kind === "personal" && templateKey === null) {
    redirect("/onboarding/template");
  }

  const [
    sections,
    userSpaces,
    reviewCount,
    sidebarMode,
    sectionsMode,
    sidebarWidth,
    sidebarExtras,
    isAdmin,
  ] = await Promise.all([
    listAllSections({ includeHidden: false }),
    listUserSpaces(),
    countReviewUploads(),
    readSidebarMode(),
    readSectionsMode(),
    readSidebarWidth(),
    readSidebarExtras(),
    isCurrentUserAdmin(),
  ]);

  // Mode follows the active space's kind. Personal/Circle orgs → Personal
  // mode; Office orgs → Work mode. The space switcher only shows orgs of
  // the current mode so the two contexts stay cleanly separated.
  const mode = modeForOrgKind(ctx.organization.kind);
  const allowedKinds = new Set(kindsForMode(mode));

  const spaceSummaries = userSpaces
    .filter((s) => allowedKinds.has(s.organization.kind))
    .map((s) => ({
      id: s.organization.id,
      name: s.organization.name,
      kind: s.organization.kind,
    }));
  const activeSpace = {
    id: ctx.organization.id,
    name: ctx.organization.name,
    kind: ctx.organization.kind,
  };

  const personalSections = [
    // Smart Sections live at the top of the Sections group. they're
    // AI-driven aggregation pages, not browsing folders. Marked as
    // kind:"smart" so the sidebar can render a subtle sparkle next to them.
    {
      label: "Diet",
      href: "/dashboard/diet",
      kind: "smart" as const,
      key: "diet",
    },
    {
      label: "Bills",
      href: "/dashboard/bills",
      kind: "smart" as const,
      key: "bills",
    },
    ...sections
      // Show Review only when there's something there.
      .filter((s) => s.ref.kind !== "review" || reviewCount > 0)
      .slice(0, 7)
      .map((s) => ({
        label: s.name,
        href: s.href,
        kind: s.ref.kind,
        key: s.ref.key,
        badge:
          s.ref.kind === "review" && reviewCount > 0
            ? String(reviewCount)
            : undefined,
      })),
  ];

  const sidebarProps = {
    user: {
      name: ctx.profile.full_name ?? ctx.profile.email,
      email: ctx.profile.email,
    },
    userId: ctx.profile.id,
    thingsLabel: resolveThingsLabel(ctx.organization),
    org: {
      name: ctx.organization.name,
      role: ctx.membership.role,
    },
    mode,
    // Personal: render the Sections list (built-ins + smart). Work: render
    // an empty array; the Sidebar swaps in the Work-specific nav.
    sections: mode === "personal" ? personalSections : [],
    spaces: spaceSummaries,
    activeSpace,
    isAdmin,
    orgKind: ctx.organization.kind,
    extras: Array.from(sidebarExtras),
  };

  // Soft-requirement banner for Workspace owners without 2FA.
  // userSpaces carries the full membership (incl. role); spaceSummaries
  // is the trimmed shape the sidebar needs and doesn't include role.
  const ownsAnyWorkspace = userSpaces.some(
    (s) => s.organization.kind === "office" && s.membership.role === "owner",
  );
  const mfaEnrolled = ownsAnyWorkspace
    ? !!(await readMfaEnrolledAt(ctx.profile.id))
    : true; // never compute / never render the banner for non-owners

  // Beta disclaimer: shown once per account on first dashboard load.
  // Cheap admin read; null means we've never recorded an ack so the
  // modal mounts. After the user clicks Continue the row is stamped
  // and this returns truthy on every subsequent render.
  const admin = createAdminClient();
  const { data: ackRow } = await admin
    .from("profiles")
    .select("beta_disclaimer_acknowledged_at")
    .eq("id", ctx.profile.id)
    .maybeSingle();
  const showBetaDisclaimer = !(
    ackRow as { beta_disclaimer_acknowledged_at: string | null } | null
  )?.beta_disclaimer_acknowledged_at;

  // Per-space theme: override the brand/shadow CSS vars on the dashboard
  // subtree so the whole UI adopts the active space's accent without any
  // client re-render (pure CSS cascade).
  const themeVars = themeCssVars(resolveSpaceTheme(ctx.organization));

  return (
    <div
      className="min-h-screen bg-canvas"
      style={themeVars as CSSProperties}
    >
      <TimezoneCookie />
      <SidebarShell
        initialCollapsed={sidebarMode === "collapsed"}
        initialSectionsOpen={sectionsMode === "open"}
        initialWidth={sidebarWidth}
        sidebarProps={sidebarProps}
      >
        <MfaBanner
          ownsAnyWorkspace={ownsAnyWorkspace}
          mfaEnrolled={mfaEnrolled}
        />
        {children}
      </SidebarShell>
      <CommandPalette
        spaces={userSpaces.map((s) => ({
          id: s.organization.id,
          name: s.organization.name,
          kind: s.organization.kind,
        }))}
      />
      {showBetaDisclaimer ? <BetaDisclaimerModal /> : null}
      <VersionWatcher
        buildVersion={
          process.env.VERCEL_GIT_COMMIT_SHA ??
          process.env.VERCEL_DEPLOYMENT_ID ??
          "dev"
        }
      />
    </div>
  );
}
