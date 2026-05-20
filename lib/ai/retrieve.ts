import "server-only";

import { createClient } from "@/lib/supabase/server";
import { listUserSpaces } from "@/lib/data/organizations";
import { sectionLabel } from "@/lib/sections-meta";
import type { Section } from "@/lib/supabase/types";

/**
 * One retrieved piece of context handed to Claude. Each gets a numeric id so
 * Claude can cite it inline as [N] and the UI can render a source card.
 *
 * processing_state:
 *   • "ready"   — full extraction available (raw_text + entities)
 *   • "pending" — file exists and matched by name, but Oria hasn't finished
 *                 reading it yet. The agent is told to be honest about this
 *                 rather than say "I don't see anything".
 */
export type RetrievedSource = {
  id: number; // 1-based slot for citations
  kind: "upload" | "reminder";
  title: string;
  snippet: string;
  href: string;
  processing_state: "ready" | "pending";
  // Display metadata for the source card
  meta: {
    section_label: string | null;
    space_name: string;
    date_label: string | null;
  };
};

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "was",
  "are",
  "were",
  "be",
  "been",
  "being",
  "i",
  "me",
  "my",
  "mine",
  "we",
  "us",
  "our",
  "you",
  "your",
  "they",
  "them",
  "their",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "of",
  "in",
  "on",
  "at",
  "to",
  "for",
  "by",
  "with",
  "from",
  "about",
  "as",
  "into",
  "this",
  "that",
  "these",
  "those",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "can",
  "could",
  "should",
  "would",
  "will",
  "what",
  "when",
  "where",
  "who",
  "whom",
  "why",
  "how",
  "which",
  "show",
  "tell",
  "find",
  "give",
  "last",
  "next",
  "ago",
]);

/**
 * Distill the user's question into a short list of meaningful keywords.
 * Trimmed of punctuation, lowercase, stopwords removed, deduped, capped.
 */
export function extractKeywords(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return Array.from(new Set(tokens)).slice(0, 8);
}

/**
 * Retrieve the most relevant uploads + reminders for a query.
 *
 *   • All queries run through the user-scoped supabase client, so RLS does the
 *     permissions work for free — personal items stay private, circle items
 *     respect access levels, limited members only see allowed sections.
 *   • Scoring is intentionally naive (keyword OR + count). Architecture leaves
 *     room for embedding-based scoring later: each source already has a
 *     normalised text payload (snippet) that can be vectorised in-place.
 */
export async function retrieveForQuery(
  query: string,
  opts: { maxSources?: number } = {},
): Promise<RetrievedSource[]> {
  const { maxSources = 8 } = opts;
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const supabase = await createClient();

  // We need the user's spaces for friendly source labels. RLS already
  // protects the queries; spaces here are just for the UI.
  const userSpaces = await listUserSpaces();
  const spaceById = new Map(
    userSpaces.map((s) => [s.organization.id, s.organization]),
  );

  // -- Uploads ----------------------------------------------------------------
  // PostgREST `or` with multiple ilike clauses. Each clause matches the title
  // or filename. The extraction.raw_text match happens via a second pass
  // because PostgREST doesn't let us OR across nested relations.
  const uploadFilters = keywords
    .map((k) => {
      const safe = k.replace(/[%,]/g, "");
      return `title.ilike.*${safe}*,filename.ilike.*${safe}*`;
    })
    .join(",");

  const uploadsRes = await supabase
    .from("uploads")
    .select(
      "id, title, filename, section, custom_section_id, organization_id, created_at",
    )
    .is("deleted_at", null)
    .or(uploadFilters)
    .order("created_at", { ascending: false })
    .limit(40);

  type UploadRow = {
    id: string;
    title: string | null;
    filename: string;
    section: Section | null;
    custom_section_id: string | null;
    organization_id: string;
    created_at: string;
  };
  const uploads = (uploadsRes.data ?? []) as UploadRow[];

  // Second pass: also include uploads whose extracted text matches, even if
  // the filename/title doesn't.
  const extractionRes = await supabase
    .from("extractions")
    .select("upload_id, raw_text")
    .or(
      keywords
        .map((k) => `raw_text.ilike.*${k.replace(/[%,]/g, "")}*`)
        .join(","),
    )
    .limit(40);

  type ExtractionRow = { upload_id: string; raw_text: string | null };
  const extractions = (extractionRes.data ?? []) as ExtractionRow[];
  const extractionByUpload = new Map(
    extractions.map((e) => [e.upload_id, e.raw_text ?? ""]),
  );

  // Fetch the upload rows referenced only by extraction matches.
  const uploadIdsKnown = new Set(uploads.map((u) => u.id));
  const extraOnly = Array.from(extractionByUpload.keys()).filter(
    (id) => !uploadIdsKnown.has(id),
  );
  if (extraOnly.length > 0) {
    const more = await supabase
      .from("uploads")
      .select(
        "id, title, filename, section, custom_section_id, organization_id, created_at",
      )
      .in("id", extraOnly)
      .is("deleted_at", null);
    for (const u of (more.data ?? []) as UploadRow[]) {
      uploads.push(u);
    }
  }

  // Also pull extractions for the title/filename-matched uploads so the
  // snippet shown to Claude carries actual content, not just a name.
  const missingExtractionIds = uploads
    .map((u) => u.id)
    .filter((id) => !extractionByUpload.has(id));
  if (missingExtractionIds.length > 0) {
    const more = await supabase
      .from("extractions")
      .select("upload_id, raw_text")
      .in("upload_id", missingExtractionIds);
    for (const e of (more.data ?? []) as ExtractionRow[]) {
      extractionByUpload.set(e.upload_id, e.raw_text ?? "");
    }
  }

  // -- Memory items (per-receipt rows) ----------------------------------------
  // Match against title, merchant, summary, location, raw_text. Each item
  // becomes its own source so the user can ask "find the Hermès invoice" and
  // get the specific receipt, not just the photo that contains it.
  const itemFilter = keywords
    .map((k) => {
      const safe = k.replace(/[%,]/g, "");
      return [
        `title.ilike.*${safe}*`,
        `merchant.ilike.*${safe}*`,
        `summary.ilike.*${safe}*`,
        `location.ilike.*${safe}*`,
        `raw_text.ilike.*${safe}*`,
        `category.ilike.*${safe}*`,
      ].join(",");
    })
    .join(",");

  const itemsRes = await supabase
    .from("memory_items")
    .select(
      "id, upload_id, organization_id, title, summary, merchant, amount_value, amount_currency, occurred_at, location, category, section, raw_text, created_at",
    )
    .is("deleted_at", null)
    .or(itemFilter)
    .order("created_at", { ascending: false })
    .limit(20);

  type ItemRow = {
    id: string;
    upload_id: string | null;
    organization_id: string;
    title: string;
    summary: string | null;
    merchant: string | null;
    amount_value: string | null;
    amount_currency: string | null;
    occurred_at: string | null;
    location: string | null;
    category: string | null;
    section: Section | null;
    raw_text: string | null;
    created_at: string;
  };
  const items = (itemsRes.data ?? []) as ItemRow[];

  // -- Reminders -------------------------------------------------------------
  const reminderFilter = keywords
    .map((k) => `title.ilike.*${k.replace(/[%,]/g, "")}*`)
    .join(",");
  const remindersRes = await supabase
    .from("reminders")
    .select("id, title, due_at, upload_id, organization_id, done, created_at")
    .or(reminderFilter)
    .limit(20);

  type ReminderRow = {
    id: string;
    title: string;
    due_at: string | null;
    upload_id: string | null;
    organization_id: string;
    done: boolean;
    created_at: string;
  };
  const reminders = (remindersRes.data ?? []) as ReminderRow[];

  // -- Score + build sources -------------------------------------------------
  type Scored = { score: number; src: Omit<RetrievedSource, "id"> };
  const scored: Scored[] = [];

  for (const u of uploads) {
    const extractedText = extractionByUpload.get(u.id) ?? "";
    const haystack = [u.title ?? "", u.filename, extractedText]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const kw of keywords) if (haystack.includes(kw)) score += kw.length;
    if (score === 0) continue;
    const space = spaceById.get(u.organization_id);
    const isPending = extractedText.length === 0;
    scored.push({
      score,
      src: {
        kind: "upload",
        title: u.title || u.filename,
        snippet: isPending
          ? "Oria is still reading this file. Details aren't available yet."
          : buildUploadSnippet(extractedText, keywords),
        href: `/dashboard/uploads/${u.id}`,
        processing_state: isPending ? "pending" : "ready",
        meta: {
          section_label: u.section
            ? sectionLabel(u.section as Section)
            : null,
          space_name: space?.name ?? "Personal",
          date_label: friendlyDate(u.created_at),
        },
      },
    });
  }

  for (const it of items) {
    const haystack = [
      it.title,
      it.merchant ?? "",
      it.summary ?? "",
      it.location ?? "",
      it.category ?? "",
      it.raw_text ?? "",
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const kw of keywords) if (haystack.includes(kw)) score += kw.length;
    if (score === 0) continue;
    // Boost items that carry structured fields — they're more likely to be
    // the "right" answer than a vaguely-matching raw upload.
    if (it.merchant || it.amount_value) score += 4;
    const space = spaceById.get(it.organization_id);
    scored.push({
      score,
      src: {
        kind: "upload",
        title: it.title,
        snippet: buildItemSnippet(it, keywords),
        href: it.upload_id
          ? `/dashboard/uploads/${it.upload_id}`
          : "/dashboard",
        processing_state: "ready",
        meta: {
          section_label: it.section
            ? sectionLabel(it.section as Section)
            : it.category,
          space_name: space?.name ?? "Personal",
          date_label: it.occurred_at
            ? friendlyDate(it.occurred_at)
            : friendlyDate(it.created_at),
        },
      },
    });
  }

  for (const r of reminders) {
    const haystack = r.title.toLowerCase();
    let score = 0;
    for (const kw of keywords) if (haystack.includes(kw)) score += kw.length;
    if (score === 0) continue;
    const space = spaceById.get(r.organization_id);
    scored.push({
      score,
      src: {
        kind: "reminder",
        title: r.title,
        snippet: r.done
          ? "Done"
          : r.due_at
            ? `Due ${friendlyDate(r.due_at)}`
            : "No date set",
        href: r.upload_id
          ? `/dashboard/uploads/${r.upload_id}`
          : "/dashboard/calendar",
        processing_state: "ready",
        meta: {
          section_label: null,
          space_name: space?.name ?? "Personal",
          date_label: r.due_at ? friendlyDate(r.due_at) : null,
        },
      },
    });
  }

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxSources).map((s, i) => ({ id: i + 1, ...s.src }));
}

/**
 * Build a small text snippet around the most informative keyword hit. Keeps
 * the prompt window cheap and the citation grounded in the matched passage.
 */
function buildUploadSnippet(rawText: string, keywords: string[]): string {
  const text = (rawText ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "(no extracted text)";
  const lower = text.toLowerCase();
  // Pick the earliest keyword match; show ±240 chars around it.
  let bestIdx = -1;
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
  }
  if (bestIdx === -1) return text.slice(0, 600);
  const start = Math.max(0, bestIdx - 200);
  const end = Math.min(text.length, bestIdx + 400);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end).trim() + suffix;
}

type ItemSnippetSource = {
  merchant: string | null;
  amount_value: string | null;
  amount_currency: string | null;
  occurred_at: string | null;
  location: string | null;
  summary: string | null;
  raw_text: string | null;
};

/**
 * Compose a tight snippet for memory_items. Leads with the structured facts
 * (merchant, amount, date, location) the user actually asked about, then
 * appends a relevant text fragment so the model can ground its answer.
 */
function buildItemSnippet(it: ItemSnippetSource, keywords: string[]): string {
  const parts: string[] = [];
  if (it.merchant) parts.push(it.merchant);
  if (it.amount_value) {
    parts.push(
      it.amount_currency
        ? `${it.amount_value} ${it.amount_currency}`
        : it.amount_value,
    );
  }
  if (it.occurred_at) parts.push(friendlyDate(it.occurred_at));
  if (it.location) parts.push(it.location);
  const head = parts.join(" · ");

  const body = it.summary
    ? it.summary
    : it.raw_text
      ? buildUploadSnippet(it.raw_text, keywords)
      : "";

  if (head && body) return `${head}\n${body}`;
  return head || body;
}

function friendlyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
