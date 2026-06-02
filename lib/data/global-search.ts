import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { searchUploads, type SearchResult } from "./search";
import { getSignedUrlMap } from "./uploads";
import {
  DEFAULT_BUILTIN_ORDER,
  listAllSections,
} from "./all-sections";
import type { Reminder, Section } from "@/lib/supabase/types";

const BUILTIN_LABELS: Record<Section, string> = {
  household: "Household",
  travel: "Travel",
  properties: "Properties",
  staff: "Staff",
  events: "Events",
  finance: "Finance",
  legal: "Legal",
  personal: "Personal",
  vendors: "Vendors",
  health: "Health",
};

export type LiveSearchResult = {
  uploads: Array<{
    id: string;
    title: string;
    section_label: string;
    document_type: string | null;
    mime_type: string | null;
    thumbnail_url: string | null;
    relative_time: string;
    href: string;
  }>;
  sections: Array<{
    id: string;
    name: string;
    href: string;
    kind: "builtin" | "custom";
  }>;
  reminders: Array<{
    id: string;
    title: string;
    due_at: string | null;
    href: string;
  }>;
  pages: Array<{
    id: string;
    label: string;
    href: string;
  }>;
  entities: Array<{
    id: string;
    name: string;
    href: string;
  }>;
};

const STATIC_PAGES: { id: string; label: string; href: string; keywords: string[] }[] = [
  { id: "home", label: "Home", href: "/dashboard", keywords: ["home", "dashboard"] },
  { id: "upload", label: "Upload", href: "/dashboard/inbox", keywords: ["upload", "drop", "add"] },
  { id: "timeline", label: "Timeline", href: "/dashboard/timeline", keywords: ["timeline", "feed", "activity"] },
  { id: "reminders", label: "Reminders", href: "/dashboard/reminders", keywords: ["reminder", "reminders", "todo", "task"] },
  { id: "circle", label: "Circle", href: "/dashboard/circle", keywords: ["circle", "family", "share", "invite"] },
  { id: "trash", label: "Deleted", href: "/dashboard/trash", keywords: ["trash", "deleted", "bin"] },
  { id: "settings", label: "Settings", href: "/dashboard/settings", keywords: ["settings", "section", "manage", "organize"] },
  { id: "private", label: "Private Oria", href: "/dashboard/private", keywords: ["private", "self-hosted", "local"] },
];

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function sectionLabel(r: SearchResult): string {
  if (r.section) return BUILTIN_LABELS[r.section];
  if (r.custom_section_id) return "Custom";
  return "Unsorted";
}

export async function liveSearch(query: string): Promise<LiveSearchResult> {
  const q = query.trim();
  if (q.length < 1) {
    return { uploads: [], sections: [], reminders: [], pages: [], entities: [] };
  }

  const ctx = await requireContext();
  const supabase = await createClient();

  // 1. Uploads (reuses the existing multi-pronged search).
  const uploads = (await searchUploads(q)).slice(0, 8);
  const thumbs = await getSignedUrlMap(
    uploads.map((u) => ({ id: u.id, storage_path: u.storage_path })),
  );

  // 2. Sections. match by name across built-in + custom + review.
  const allSections = await listAllSections({ includeHidden: false });
  const lowerQ = q.toLowerCase();
  const sections = allSections
    .filter((s) => s.name.toLowerCase().includes(lowerQ))
    .slice(0, 6)
    .map((s) => ({
      id: `${s.ref.kind}:${s.ref.key}`,
      name: s.name,
      href: s.href,
      kind: (s.ref.kind === "review" ? "builtin" : s.ref.kind) as
        | "builtin"
        | "custom",
    }));

  // 3. Reminders. match by title.
  const remindersRes = await supabase
    .from("reminders")
    .select("id, title, due_at, upload_id")
    .eq("organization_id", ctx.organization.id)
    .ilike("title", `%${q.replace(/[%_]/g, "")}%`)
    .order("done", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(5);
  const reminderRows =
    (remindersRes.data as Array<
      Pick<Reminder, "id" | "title" | "due_at" | "upload_id">
    >) ?? [];

  // 3b. Entities (things). match by name.
  const entitiesRes = await supabase
    .from("entities")
    .select("id, name")
    .eq("organization_id", ctx.organization.id)
    .is("archived_at", null)
    .ilike("name", `%${q.replace(/[%_]/g, "")}%`)
    .order("created_at", { ascending: false })
    .limit(5);
  const entityRows = (entitiesRes.data as Array<{ id: string; name: string }>) ?? [];

  // 4. Static pages. keyword match.
  const pages = STATIC_PAGES.filter(
    (p) =>
      p.label.toLowerCase().includes(lowerQ) ||
      p.keywords.some((k) => k.includes(lowerQ) || lowerQ.includes(k)),
  ).slice(0, 4);

  return {
    uploads: uploads.map((u) => ({
      id: u.id,
      title: u.title ?? u.filename,
      section_label: sectionLabel(u),
      document_type: u.document_type ?? null,
      mime_type: u.mime_type ?? null,
      thumbnail_url: thumbs.get(u.id) ?? null,
      relative_time: relativeTime(u.created_at),
      href: `/dashboard/uploads/${u.id}`,
    })),
    sections,
    reminders: reminderRows.map((r) => ({
      id: r.id,
      title: r.title,
      due_at: r.due_at,
      href: r.upload_id
        ? `/dashboard/uploads/${r.upload_id}`
        : "/dashboard/reminders",
    })),
    pages: pages.map((p) => ({ id: p.id, label: p.label, href: p.href })),
    entities: entityRows.map((e) => ({
      id: e.id,
      name: e.name,
      href: `/dashboard/things/${e.id}`,
    })),
  };
}

// Used by the empty-input dropdown to suggest something useful.
export function defaultSuggestions(): { label: string; query: string }[] {
  return [
    { label: "Last week's uploads", query: "last week" },
    { label: "Find old receipts", query: "receipts" },
    { label: "Pending reminders", query: "today" },
  ];
}

// Re-export so route handler doesn't need to import DEFAULT_BUILTIN_ORDER.
export { DEFAULT_BUILTIN_ORDER };
