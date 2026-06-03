import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Web app manifest (Next metadata route, served at /manifest.webmanifest).
 *
 * Colors mirror the light --canvas token in app/globals.css (#f7f5f0): the
 * splash background and the toolbar/theme color match the icon field, so the
 * install splash reads as one calm surface. Icons come from the F0 set; the
 * 512 maskable variant carries its own purpose so Android can mask it.
 *
 * The description is localized via next-intl (cookie locale at request time).
 * name/short_name stay the brand "Oria" in every locale.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations("pwa");

  return {
    name: "Oria",
    short_name: "Oria",
    description: t("app_description"),
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "natural",
    theme_color: "#f7f5f0",
    background_color: "#f7f5f0",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
