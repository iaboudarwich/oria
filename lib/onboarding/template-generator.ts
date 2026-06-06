import "server-only";

import { infraComplete } from "@/lib/ai-providers";
import { recordAiCall } from "@/lib/ai/telemetry";
import { TEMPLATES, templateCatalogForPrompt } from "./templates";
import type { SetupPlan, SpacePlan, UserContext, WorkspacePlan } from "./types";

/** Reject after `ms` so a slow reasoning call cannot blow the onboarding budget. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("reasoning_timeout")), ms)),
  ]);
}

const TAILOR_TIMEOUT_MS = 90_000;

/**
 * Run the tailoring prompt on the reasoning tier for a deeper, more nuanced
 * plan. If reasoning exceeds the timeout (or errors), fall back to the premium
 * tier with a single retry so onboarding never hangs. Returns the raw text.
 */
async function tailorWithReasoning(system: string, user: string): Promise<string | null> {
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  const startedAt = Date.now();
  try {
    const res = await withTimeout(
      infraComplete(messages, {
        tier: "reasoning",
        maxTokens: 2600,
        onUsage: (u) =>
          recordAiCall({
            surface: "onboarding-tailor:reasoning",
            model: u.model,
            inputTokens: u.tokens.input,
            outputTokens: u.tokens.output,
            latencyMs: Date.now() - startedAt,
          }),
      }),
      TAILOR_TIMEOUT_MS,
    );
    if (res?.content) return res.content;
  } catch {
    // timeout or reasoning error; fall through to premium
  }
  const fallbackAt = Date.now();
  const res2 = await infraComplete(messages, {
    tier: "premium",
    maxTokens: 2600,
    onUsage: (u) =>
      recordAiCall({
        surface: "onboarding-tailor:premium-fallback",
        model: u.model,
        inputTokens: u.tokens.input,
        outputTokens: u.tokens.output,
        latencyMs: Date.now() - fallbackAt,
      }),
  });
  return res2?.content ?? null;
}

const LANG: Record<string, string> = { en: "English", ar: "Arabic", fr: "French", es: "Spanish" };

const ALLOWED_ICONS = new Set([
  "home",
  "travel",
  "properties",
  "staff",
  "events",
  "finance",
  "legal",
  "personal",
  "vendors",
  "health",
  "wallet",
  "scales",
  "tag",
  "heart",
  "chart",
  "plane",
  "person",
]);

/**
 * Hybrid template generator. Given the conversation's UserContext, Sonnet picks
 * the closest real-life template(s) and tailors them with extreme attention:
 * section titles rewritten to the user's own words and language, reordered by
 * what overwhelms them, net-new sections added, irrelevant ones dropped, an
 * accent chosen, and Ask Oria starters written for them. Multi-role users get
 * multiple workspaces. Falls back to a single best-match template if the model
 * is unavailable or returns nothing usable.
 */
export async function generateSetupPlan(ctx: UserContext, locale = "en"): Promise<SetupPlan> {
  const language = LANG[locale] ?? "English";
  const system = `You build a personal-organization setup from what a user told us about their life. You are given a catalog of real-life templates and a structured profile. Choose ONE OR MORE base templates that fit, then tailor hard.

Rules:
- Write every user-facing string (workspace names, section titles, descriptions, Ask starters) in ${language}, in the user's own vocabulary (if they said "kids" use "Kids", not "Students").
- If the user has a personal life AND one or more professional/role contexts, return a Personal space (area "personal") AND a Work area (area "work") with one workspace per distinct professional role. A teacher who also coaches gets two work workspaces.
- Reorder sections so the most chaotic / week-one-priority areas come first (lower priority number = higher).
- Add net-new sections the user mentioned that no template covers; drop sections that clearly do not apply.
- Pick an accent_color (hex) that fits each workspace's role.
- Write 2 to 3 Ask Oria starters specific to this user.
- Section icons MUST be one of: home, travel, properties, staff, events, finance, legal, personal, vendors, health, wallet, scales, tag, heart, chart, plane, person.
- Never use the em-dash character (Unicode U+2014). Use a comma, a period, or a rewrite.

Return JSON ONLY:
{
  "spaces": [
    {
      "label": "short space label",
      "area": "personal" | "work",
      "workspaces": [
        {
          "name": "workspace name",
          "kind": "personal" | "office" | "circle",
          "description": "one short line",
          "accent_color": "#rrggbb",
          "template_id": "the base template id used",
          "sections": [{"key": "snake_case", "title": "...", "icon": "...", "priority": 0}],
          "ask_oria_starters": ["...", "..."]
        }
      ]
    }
  ]
}`;

  const user = `Template catalog:\n${templateCatalogForPrompt()}\n\nUser profile:\n${JSON.stringify(ctx, null, 2)}\n\nBuild the tailored setup as JSON.`;

  try {
    const raw = (await tailorWithReasoning(system, user))?.trim() || "{}";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { spaces?: unknown };
    const plan = sanitizePlan(parsed.spaces);
    return plan.spaces.length > 0 ? plan : fallbackPlan(ctx);
  } catch {
    return fallbackPlan(ctx);
  }
}

/**
 * Reshape generator (F5): given the user's stated request, the short clarifying
 * answers, and the names of what they already have, produce ONLY the new
 * spaces/workspaces/sections to add. Additive by design; deletions/renames are
 * handled separately with explicit confirmation. Falls back to empty.
 */
export async function generateReshapePlan(
  intent: string,
  answers: string,
  existing: string[],
  locale = "en",
): Promise<SetupPlan> {
  const language = LANG[locale] ?? "English";

  const system = `The user already has Oria set up and wants to add something. From their request, output ONLY the new spaces/workspaces/sections to CREATE. Do not recreate anything that already exists. If they only want a few sections in an existing area, return one workspace in the matching area with just those sections.

- Write all user-facing strings in ${language}, in the user's words.
- A new role or job is usually a Work workspace (area "work", kind "office"). A life area is usually the Personal area.
- Section icons MUST be one of: home, travel, properties, staff, events, finance, legal, personal, vendors, health, wallet, scales, tag, heart, chart, plane, person.
- Never use the em-dash character (Unicode U+2014).

Return JSON ONLY in the setup-plan shape:
{"spaces":[{"label":"...","area":"personal"|"work","workspaces":[{"name":"...","kind":"personal"|"office"|"circle","description":"...","accent_color":"#rrggbb","template_id":"custom","sections":[{"key":"snake","title":"...","icon":"...","priority":0}],"ask_oria_starters":[]}]}]}`;

  const user = `The user said: "${intent}"\nClarifying answers: ${answers || "(none)"}\nThey already have: ${existing.join(", ") || "(nothing yet)"}\n\nReturn the additions as JSON.`;

  try {
    const msg = await infraComplete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { tier: "premium", maxTokens: 1500 },
    );
    const raw = msg?.content.trim() || "{}";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    const parsed = JSON.parse(cleaned) as { spaces?: unknown };
    return sanitizePlan(parsed.spaces);
  } catch {
    return { spaces: [] };
  }
}

function sanitizePlan(spaces: unknown): SetupPlan {
  if (!Array.isArray(spaces)) return { spaces: [] };
  const out: SpacePlan[] = [];
  for (const s of spaces.slice(0, 4)) {
    const sp = s as Record<string, unknown>;
    const area = sp.area === "work" ? "work" : "personal";
    const wsRaw = Array.isArray(sp.workspaces) ? sp.workspaces : [];
    const workspaces: WorkspacePlan[] = [];
    for (const w of wsRaw.slice(0, 6)) {
      const wp = w as Record<string, unknown>;
      const name = str(wp.name);
      if (!name) continue;
      const kind = wp.kind === "office" ? "office" : wp.kind === "circle" ? "circle" : "personal";
      const sectionsRaw = Array.isArray(wp.sections) ? wp.sections : [];
      const sections = sectionsRaw.slice(0, 12).map((sec, i) => {
        const secO = sec as Record<string, unknown>;
        const title = str(secO.title) || `Section ${i + 1}`;
        const icon =
          typeof secO.icon === "string" && ALLOWED_ICONS.has(secO.icon) ? secO.icon : "tag";
        return {
          key:
            str(secO.key) ||
            title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_|_$/g, "") ||
            `s${i}`,
          title,
          icon,
          priority: typeof secO.priority === "number" ? secO.priority : i,
        };
      });
      workspaces.push({
        name,
        kind,
        description: str(wp.description),
        accent_color:
          typeof wp.accent_color === "string" && /^#[0-9a-fA-F]{6}$/.test(wp.accent_color)
            ? wp.accent_color
            : null,
        sections,
        ask_oria_starters: Array.isArray(wp.ask_oria_starters)
          ? wp.ask_oria_starters.filter((x): x is string => typeof x === "string").slice(0, 4)
          : [],
        template_id: str(wp.template_id) || "custom",
      });
    }
    if (workspaces.length)
      out.push({
        label: str(sp.label) || (area === "work" ? "Work" : "Personal"),
        area,
        workspaces,
      });
  }
  return { spaces: out };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Deterministic fallback: best-match template into a single personal space. */
function fallbackPlan(ctx: UserContext): SetupPlan {
  const hay = [...ctx.roles, ...ctx.life_contexts, ctx.notes, ctx.week_one_priority]
    .join(" ")
    .toLowerCase();
  let best = TEMPLATES.find((t) => t.id === "custom")!;
  let bestScore = 0;
  for (const t of TEMPLATES) {
    const score = t.matchSignals.reduce((n, sig) => (hay.includes(sig) ? n + 1 : n), 0);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  const sections = (
    best.sections.length ? best.sections : TEMPLATES.find((t) => t.id === "renter")!.sections
  ).map((s) => ({ key: s.key, title: s.title, icon: s.icon, priority: s.priority }));
  return {
    spaces: [
      {
        label: "Personal",
        area: "personal",
        workspaces: [
          {
            name: best.displayName,
            kind: "personal",
            description: best.description,
            accent_color: best.accentSuggestion,
            sections,
            ask_oria_starters: best.askStarters,
            template_id: best.id,
          },
        ],
      },
    ],
  };
}
