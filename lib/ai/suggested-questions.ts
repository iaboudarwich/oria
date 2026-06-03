import type { Locale } from "@/i18n/config";

// Space-aware starter questions for the Ask Oria empty state. Keyed by a
// bucket derived from the space's template (or its top-level kind when no
// template). Localized in all four languages; ar/fr/es are machine
// translations to be revised, placeholders and meaning preserved.

type Bucket = "personal" | "work" | "investor";

const QUESTIONS: Record<Bucket, Record<Locale, string[]>> = {
  personal: {
    en: ["What is in my inbox?", "When is my next reminder?", "Show recent uploads."],
    ar: ["ماذا يوجد في صندوق الوارد؟", "متى موعد تذكيري التالي؟", "اعرض الملفات المرفوعة مؤخراً."],
    fr: ["Qu'y a-t-il dans ma boîte de réception?", "Quel est mon prochain rappel?", "Afficher les imports récents."],
    es: ["¿Qué hay en mi bandeja de entrada?", "¿Cuándo es mi próximo recordatorio?", "Muestra las cargas recientes."],
  },
  work: {
    en: ["What are our highest recurring expenses?", "Summarize this quarter's reports", "Which contracts are renewing?"],
    ar: ["ما هي أعلى نفقاتنا المتكررة؟", "لخّص تقارير هذا الربع", "ما العقود التي ستتجدد؟"],
    fr: ["Quelles sont nos dépenses récurrentes les plus élevées?", "Résume les rapports de ce trimestre", "Quels contrats arrivent à renouvellement?"],
    es: ["¿Cuáles son nuestros mayores gastos recurrentes?", "Resume los informes de este trimestre", "¿Qué contratos se están renovando?"],
  },
  investor: {
    en: ["What is our portfolio composition?", "Which deals are in diligence?", "Show recent fund reporting."],
    ar: ["ما هو تكوين محفظتنا؟", "ما الصفقات قيد العناية الواجبة؟", "اعرض تقارير الصناديق الأخيرة."],
    fr: ["Quelle est la composition de notre portefeuille?", "Quelles opérations sont en cours de diligence?", "Afficher les rapports de fonds récents."],
    es: ["¿Cuál es la composición de nuestra cartera?", "¿Qué operaciones están en diligencia debida?", "Muestra los informes de fondos recientes."],
  },
};

function bucketFor(opts: {
  template?: string | null;
  parentKind?: "personal" | "work";
  kind?: string;
}): Bucket {
  // 'investor' is the one real-life template with its own starter bucket.
  // Everything else falls to the space's area (work vs personal). Suggestions
  // are otherwise tailored from the user's actual context, not the template.
  if (opts.template === "investor") return "investor";
  const isWork = opts.parentKind === "work" || opts.kind === "office";
  return isWork ? "work" : "personal";
}

export function suggestedQuestions(
  opts: { template?: string | null; parentKind?: "personal" | "work"; kind?: string },
  locale: Locale,
): string[] {
  const bucket = bucketFor(opts);
  return QUESTIONS[bucket][locale] ?? QUESTIONS[bucket].en;
}
