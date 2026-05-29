"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { locales, type Locale } from "@/i18n/config";

/**
 * Update the user's preferred_language in profiles and set the oria_locale
 * cookie so next-intl picks it up immediately on the next request.
 */
export async function setAccountLanguage(lang: Locale): Promise<void> {
  if (!(locales as readonly string[]).includes(lang)) return;

  // Persist to profile
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("profiles")
      .update({ preferred_language: lang })
      .eq("id", user.id);
  }

  // Set cookie — next-intl reads this on every request
  const cookieStore = await cookies();
  cookieStore.set("oria_locale", lang, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/", "layout");
}

/**
 * Update the content_language of an organization.
 * Only the workspace owner may call this.
 */
export async function setWorkspaceContentLanguage(
  organizationId: string,
  lang: Locale,
): Promise<{ ok: boolean; error?: string }> {
  if (!(locales as readonly string[]).includes(lang)) {
    return { ok: false, error: "Invalid language." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  // Owner-only guard via RLS (org update policy requires owner role)
  const { error } = await supabase
    .from("organizations")
    .update({ content_language: lang })
    .eq("id", organizationId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * On workspace creation, inherit the creator's preferred_language as the
 * workspace's content_language.
 */
export async function inheritLanguageForOrg(
  organizationId: string,
  userId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("preferred_language")
    .eq("id", userId)
    .maybeSingle();
  const lang = (profile as { preferred_language?: string } | null)
    ?.preferred_language ?? "en";
  await admin
    .from("organizations")
    .update({ content_language: lang })
    .eq("id", organizationId);
}
