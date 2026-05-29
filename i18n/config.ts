export const locales = ['en', 'ar', 'fr', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';
export const rtlLocales: Locale[] = ['ar'];
export function isRtl(locale: Locale): boolean { return rtlLocales.includes(locale); }
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  ar: 'Arabic (العربية)',
  fr: 'Français',
  es: 'Español',
};
