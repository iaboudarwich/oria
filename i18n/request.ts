import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, locales, type Locale } from './config';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const stored = cookieStore.get('oria_locale')?.value as Locale | undefined;
  const locale: Locale =
    stored && (locales as readonly string[]).includes(stored)
      ? stored
      : defaultLocale;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
