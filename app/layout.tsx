import type { Metadata, Viewport } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { isRtl, type Locale } from "@/i18n/config";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { NavigationBreadcrumbs } from "@/components/feedback/navigation-breadcrumbs";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { Analytics } from "@vercel/analytics/next";
import { versionedIcon } from "@/lib/brand/icon-version";
import { readAccent } from "@/lib/data/appearance-prefs";
import { accentStyleCss } from "@/lib/appearance/accent";
import "./globals.css";

// UI + numbers. Hanken Grotesk has clean tabular figures (see globals.css).
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Display: wordmark, greeting, section + briefing headlines. Variable font, so
// the optical-size axis is on and every weight (400-600 used) comes from the
// variable range; `weight` must be omitted when `axes` is set.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Oria",
  description:
    "Drop anything into Oria. We organize it. A calm memory for households, families, assistants, and teams.",
  metadataBase: new URL("https://oria.app"),
  applicationName: "Oria",
  appleWebApp: {
    capable: true,
    title: "Oria",
    statusBarStyle: "default",
  },
  icons: {
    // app/favicon.ico is content-hashed by Next automatically; the apple-touch
    // icon is a static public path, so version it by hand to bust caches.
    apple: versionedIcon("/icons/apple-touch-icon.png"),
  },
  other: {
    // Next emits the modern `mobile-web-app-capable`; older iOS still honors
    // the apple-prefixed name, so emit it explicitly too.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Let the app draw under the iOS notch/home indicator in standalone mode.
  viewportFit: "cover",
  // Status bar / toolbar color tracks the canvas token in each scheme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ECEAE4" },
    { media: "(prefers-color-scheme: dark)", color: "#08090B" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const dir = isRtl(locale as Locale) ? "rtl" : "ltr";

  // Accent (brand highlight) is injected from the per-user cookie as the FIRST
  // thing in <body>, after the globals stylesheet, so it overrides the default
  // --brand for both themes before paint (no flash), app-wide. Only brand vars;
  // the semantic data colors are never touched here.
  const accent = await readAccent();

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${hanken.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-ink">
        <style id="oria-accent" dangerouslySetInnerHTML={{ __html: accentStyleCss(accent) }} />
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            <NavigationBreadcrumbs />
            {children}
            <InstallPrompt />
          </NextIntlClientProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
        <Analytics />
      </body>
    </html>
  );
}
