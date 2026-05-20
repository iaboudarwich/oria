import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SidebarShell } from "@/components/dashboard/sidebar-shell";
import {
  getCurrentContext,
  listUserSpaces,
} from "@/lib/data/organizations";
import { listAllSections } from "@/lib/data/all-sections";
import { countReviewUploads } from "@/lib/data/sections";
import {
  readSectionsMode,
  readSidebarMode,
  readSidebarWidth,
} from "@/lib/data/sidebar-prefs";
import { kindsForMode, modeForOrgKind } from "@/lib/data/mode";

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

  const [
    sections,
    userSpaces,
    reviewCount,
    sidebarMode,
    sectionsMode,
    sidebarWidth,
  ] = await Promise.all([
    listAllSections({ includeHidden: false }),
    listUserSpaces(),
    countReviewUploads(),
    readSidebarMode(),
    readSectionsMode(),
    readSidebarWidth(),
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
    // Smart Sections live at the top of the Sections group — they're
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
  };

  return (
    <div className="min-h-screen bg-canvas">
      <SidebarShell
        initialCollapsed={sidebarMode === "collapsed"}
        initialSectionsOpen={sectionsMode === "open"}
        initialWidth={sidebarWidth}
        sidebarProps={sidebarProps}
      >
        {children}
      </SidebarShell>
    </div>
  );
}
