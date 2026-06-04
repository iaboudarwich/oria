/**
 * Onboarding intent classification + branching (Round 14.9 F1).
 *
 * Pure module (no server-only, no SDK) so the branching is unit-testable and
 * the engine, the executor, and the tests all share ONE definition. After Q1
 * ("what do you do?") the answer is classified into an intent; the intent
 * selects which follow-up question tree to ask AND a provisioning hint for the
 * template_key / area the per-context surfaces (Round 16) consume.
 */

/** The values organizations.template_key may legitimately hold (migration 0065/0033). */
export const TEMPLATE_KEYS = [
  "renter",
  "homeowner",
  "parent",
  "freelancer",
  "traveler",
  "teacher",
  "caregiver",
  "investor",
  "custom",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export type OnboardingIntent =
  | "investor"
  | "family_office"
  | "founder"
  | "freelancer"
  | "job_seeker"
  | "student"
  | "parent"
  | "renter"
  | "caregiver"
  | "teacher"
  | "traveler"
  | "personal";

// Ordered: the first intent whose signals match wins. More specific intents
// (family_office before investor) come first so a "family office" answer is not
// swallowed by the broader "investor" signals.
const SIGNALS: ReadonlyArray<readonly [OnboardingIntent, readonly string[]]> = [
  ["family_office", ["family office", "estate", "trust fund", "trusts", "generational wealth", "wealth manager"]],
  ["investor", ["investor", "investing", "portfolio", "venture", "vc", "angel", "fund manager", "limited partner", "deal flow", "equities", "stocks", "lp report"]],
  ["founder", ["founder", "co-founder", "startup", "my company", "my startup", "ceo", "building a company", "entrepreneur"]],
  ["freelancer", ["freelance", "freelancer", "self-employed", "self employed", "consultant", "contractor", "my clients", "solo business"]],
  ["job_seeker", ["job seeker", "looking for a job", "looking for work", "job hunt", "job search", "unemployed", "between jobs", "interviewing", "applications out", "seeking work"]],
  ["student", ["student", "college", "university", "studying", "grad school", "phd", "undergrad", "my classes", "my exams", "my degree"]],
  ["parent", ["parent", "my kids", "my children", "my child", "my son", "my daughter", "raising kids", "raising two", "raising three", "stay-at-home", "stay at home mom", "stay at home dad"]],
  ["caregiver", ["caregiver", "caring for", "elderly", "my mom's health", "my dad's health", "medications", "patient", "in-home care"]],
  ["teacher", ["teacher", "i teach", "teaching", "professor", "educator", "classroom", "my students"]],
  ["renter", ["rent ", "renter", "renting", "i rent", "apartment", "tenant", "my lease", "landlord"]],
  ["traveler", ["frequent traveler", "always traveling", "frequent flyer", "digital nomad", "always flying", "trips abroad", "constant travel"]],
];

/** Classify the user's first answer into an onboarding intent. Deterministic. */
export function classifyIntent(text: string): OnboardingIntent {
  const hay = ` ${(text || "").toLowerCase()} `;
  for (const [intent, words] of SIGNALS) {
    if (words.some((w) => hay.includes(w))) return intent;
  }
  return "personal";
}

/** Which follow-up question tree (a key in question-bank.json "trees") an intent asks. */
export const INTENT_TREE: Record<OnboardingIntent, string> = {
  investor: "investor",
  family_office: "family_office",
  founder: "business",
  freelancer: "business",
  teacher: "business",
  job_seeker: "job_seeker",
  student: "student",
  parent: "parent",
  renter: "personal",
  caregiver: "personal",
  traveler: "personal",
  personal: "personal",
};

export function questionTreeKey(intent: OnboardingIntent): string {
  return INTENT_TREE[intent];
}

export type ProvisioningHint = {
  /** What organizations.template_key should become (drives the surface). */
  templateKey: TemplateKey;
  /** Which top-level area the user's primary context lives in. */
  area: "personal" | "work";
  /** The per-context surface archetype this should resolve to (for clarity/tests). */
  archetype: "personal" | "investor" | "business" | "family_office";
};

// The resolver (lib/daily/context-surface.ts) reads: template_key==="investor"
// -> investor; a work/office org with a business work-template (freelancer,
// teacher) -> business, else (an unsignaled office org, the family office) ->
// family_office; else personal. So investor must land on the PERSONAL org with
// template_key "investor", and the primary work org carries its intent's
// template_key (freelancer for founder/freelancer, teacher, custom for family
// office) so Business and Family Office both resolve.
export const PROVISIONING: Record<OnboardingIntent, ProvisioningHint> = {
  investor:      { templateKey: "investor",   area: "personal", archetype: "investor" },
  family_office: { templateKey: "custom",     area: "work",     archetype: "family_office" },
  founder:       { templateKey: "freelancer", area: "work",     archetype: "business" },
  freelancer:    { templateKey: "freelancer", area: "work",     archetype: "business" },
  teacher:       { templateKey: "teacher",    area: "work",     archetype: "business" },
  job_seeker:    { templateKey: "custom",     area: "personal", archetype: "personal" },
  student:       { templateKey: "custom",     area: "personal", archetype: "personal" },
  parent:        { templateKey: "parent",     area: "personal", archetype: "personal" },
  renter:        { templateKey: "renter",     area: "personal", archetype: "personal" },
  caregiver:     { templateKey: "caregiver",  area: "personal", archetype: "personal" },
  traveler:      { templateKey: "traveler",   area: "personal", archetype: "personal" },
  personal:      { templateKey: "custom",     area: "personal", archetype: "personal" },
};

export function provisioningFor(intent: OnboardingIntent): ProvisioningHint {
  return PROVISIONING[intent];
}

/**
 * Validate a generator-supplied template_id into a real template_key column
 * value. Anything not in the allowed set collapses to "custom". This replaces
 * the executor's old hardcoded "custom", so an investor actually gets
 * template_key "investor" and the Investor surface renders.
 */
export function resolveTemplateKey(templateId: string | null | undefined): TemplateKey {
  const v = (templateId ?? "").trim();
  return (TEMPLATE_KEYS as readonly string[]).includes(v) ? (v as TemplateKey) : "custom";
}
