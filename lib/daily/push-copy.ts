/**
 * Localized push bodies for the daily loop.
 *
 * Push payloads transit Apple/Google/Mozilla, so they stay deliberately
 * generic: no calendar titles, amounts, or document names ever (per the PWA
 * brief). The specifics load in-app when the user taps through. Title is always
 * "Oria". Localized here in code (not messages/*.json) because the cron runs
 * with no request locale; it reads the user's stored profiles.locale instead.
 */

export type DailyPushKind =
  | "morning_briefing"
  | "weekly_review"
  | "yesterday_recap"
  | "pre_meeting_prep"
  | "custom"
  | "journal";

type Locale = "en" | "ar" | "fr" | "es";

const BODIES: Record<DailyPushKind, Record<Locale, string>> = {
  morning_briefing: {
    en: "Your morning briefing is ready.",
    ar: "موجزك الصباحي جاهز.",
    fr: "Votre briefing du matin est prêt.",
    es: "Tu resumen de la mañana está listo.",
  },
  weekly_review: {
    en: "Your weekly review is ready.",
    ar: "مراجعتك الأسبوعية جاهزة.",
    fr: "Votre revue de la semaine est prête.",
    es: "Tu revisión semanal está lista.",
  },
  yesterday_recap: {
    en: "Your recap of yesterday is ready.",
    ar: "ملخص يومك السابق جاهز.",
    fr: "Votre récapitulatif d'hier est prêt.",
    es: "Tu resumen de ayer está listo.",
  },
  pre_meeting_prep: {
    en: "You have something coming up soon.",
    ar: "لديك أمر قادم قريبًا.",
    fr: "Vous avez un évènement à venir bientôt.",
    es: "Tienes algo próximamente.",
  },
  custom: {
    en: "A routine just ran in Oria.",
    ar: "تم تشغيل روتين في أوريا.",
    fr: "Une routine vient de s'exécuter dans Oria.",
    es: "Una rutina se ejecutó en Oria.",
  },
  journal: {
    en: "Your daily journal is ready.",
    ar: "مذكرتك اليومية جاهزة.",
    fr: "Votre journal du jour est prêt.",
    es: "Tu diario del día está listo.",
  },
};

function normalizeLocale(locale: string | null | undefined): Locale {
  const l = (locale ?? "en").slice(0, 2).toLowerCase();
  return l === "ar" || l === "fr" || l === "es" ? l : "en";
}

export function dailyPushBody(
  kind: DailyPushKind,
  locale: string | null | undefined,
): { title: string; body: string } {
  return { title: "Oria", body: BODIES[kind][normalizeLocale(locale)] };
}
