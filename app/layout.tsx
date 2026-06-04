import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { isRtl, type Locale } from "@/i18n/config";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { NavigationBreadcrumbs } from "@/components/feedback/navigation-breadcrumbs";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { Analytics } from "@vercel/analytics/next";
import { versionedIcon } from "@/lib/brand/icon-version";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
  display: "swap",
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
    { media: "(prefers-color-scheme: light)", color: "#f7f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0e0d" },
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

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-ink">
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
