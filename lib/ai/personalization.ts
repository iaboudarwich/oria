import type { UserProfile } from "@/lib/data/user-profile";
import type { Locale } from "@/i18n/config";

// Turns a UserProfile into the knobs every AI surface adapts to: answer
// length, tone, the sections the user engages with, and explicit focus /
// pinned metrics. Pure and dependency-light so it is easy to test.

export type PersonalizationContext = {
  /** Target answer length in words. */
  responseWords: number;
  tone: "warm" | "neutral";
  /** Top engaged section keys (most first). */
  topSections: string[];
  focusAreas: string[];
  pinnedMetrics: string[];
};

export function buildPersonalizationContext(
  profile: UserProfile,
): PersonalizationContext {
  const responseWords =
    profile.preferences.responseLength === "short"
      ? 80
      : profile.preferences.responseLength === "long"
        ? 400
        : 200;
  return {
    responseWords,
    tone: profile.preferences.formality === "professional" ? "neutral" : "warm",
    topSections: profile.derived.topSections.slice(0, 3).map((s) => s.key),
    focusAreas: profile.preferences.focusAreas,
    pinnedMetrics: profile.preferences.pinnedMetrics,
  };
}

/**
 * A compact (~100 token) PERSONAL CONTEXT block for the system prompt. Sits
 * alongside Round 2's SPACE CONTEXT. The model adapts to it but never
 * mentions it.
 */
export function personalContextBlock(p: PersonalizationContext): string {
  const lines: string[] = [
    "PERSONAL CONTEXT (adapt to this; never mention it or explain that you are adapting):",
    `Target answer length: about ${p.responseWords} words. Tone: ${p.tone === "warm" ? "warm and personable" : "neutral and professional"}.`,
  ];
  if (p.focusAreas.length > 0) {
    lines.push(
      `Focus areas the user cares about: ${p.focusAreas.join(", ")}. Lead with these when they are relevant.`,
    );
  }
  if (p.pinnedMetrics.length > 0) {
    lines.push(
      `Pinned metrics to surface when relevant: ${p.pinnedMetrics.join(", ")}.`,
    );
  }
  if (p.topSections.length > 0) {
    lines.push(`Most-engaged sections: ${p.topSections.join(", ")}.`);
  }
  return lines.join("\n");
}

// A short section-targeted starter question per locale, used to weight the
// Ask empty-state suggestions toward what the user actually engages with.
const SECTION_QUESTION: Record<string, Record<Locale, string>> = {
  bills: {
    en: "What are my upcoming bills?",
    ar: "ما هي فواتيري القادمة؟",
    fr: "Quelles sont mes prochaines factures?",
    es: "¿Cuáles son mis próximas facturas?",
  },
  finance: {
    en: "How much have I spent recently?",
    ar: "كم أنفقت مؤخراً؟",
    fr: "Combien ai-je dépensé récemment?",
    es: "¿Cuánto he gastado recientemente?",
  },
  diet: {
    en: "What did I eat today?",
    ar: "ماذا أكلت اليوم؟",
    fr: "Qu'ai-je mangé aujourd'hui?",
    es: "¿Qué comí hoy?",
  },
  travel: {
    en: "When is my next trip?",
    ar: "متى رحلتي القادمة؟",
    fr: "Quand est mon prochain voyage?",
    es: "¿Cuándo es mi próximo viaje?",
  },
  health: {
    en: "What health appointments are coming up?",
    ar: "ما المواعيد الصحية القادمة؟",
    fr: "Quels rendez-vous médicaux arrivent?",
    es: "¿Qué citas médicas se acercan?",
  },
};

/**
 * Weight the suggested questions toward the user's most-engaged sections by
 * prepending a section-targeted question for the top matching section, then
 * dedupes and caps the list. If no top section maps to a known question, the
 * base list is returned unchanged.
 */
export function personalizeQuestions(
  base: string[],
  topSections: string[],
  locale: Locale,
): string[] {
  const lead: string[] = [];
  for (const key of topSections) {
    const q = SECTION_QUESTION[key]?.[locale] ?? SECTION_QUESTION[key]?.en;
    if (q) {
      lead.push(q);
      break; // one section-targeted lead is enough
    }
  }
  const merged = [...lead, ...base];
  return Array.from(new Set(merged)).slice(0, 4);
}
