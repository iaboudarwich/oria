"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";
import { coerceDensity, coerceFontSize, coerceTheme } from "@/lib/appearance/prefs";
import { coerceAccent } from "@/lib/appearance/accent";
import {
  DENSITY_COOKIE,
  FONT_SIZE_COOKIE,
  THEME_COOKIE,
  ACCENT_COOKIE,
} from "./appearance-prefs";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Persist the per-user appearance preference. Writes the durable record to
 * user_preferences (the cross-device source of truth), mirrors to FOUC-free
 * cookies for the next server paint, and audits the change. The client applies
 * the change optimistically to the shell before this resolves.
 */
export async function setAppearance(input: {
  density?: string;
  fontSize?: string;
}): Promise<void> {
  const ctx = await requireContext();
  const density = coerceDensity(input.density);
  const fontSize = coerceFontSize(input.fontSize);

  const admin = createAdminClient();
  await admin.from("user_preferences").upsert(
    {
      user_id: ctx.profile.id,
      density,
      font_size: fontSize,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  const jar = await cookies();
  const opts = { path: "/", maxAge: ONE_YEAR, sameSite: "lax" as const };
  jar.set(DENSITY_COOKIE, density, opts);
  jar.set(FONT_SIZE_COOKIE, fontSize, opts);

  await logAuditEvent({
    userId: ctx.profile.id,
    action: "settings.appearance.changed",
    metadata: { density, fontSize },
  });

  revalidatePath("/dashboard", "layout");
}

/**
 * Persist the per-user THEME (dark/light/system) and ACCENT (the brand
 * highlight: a preset key or a validated hex). Theme is owned live by
 * next-themes for no-flash; this writes the durable record + cookie mirror.
 * Accent is mirrored to a cookie the root layout injects before paint. Only the
 * provided fields are touched, so this never clobbers density/font. Audited.
 */
export async function setAppearancePrefs(input: {
  theme?: string;
  accent?: string;
}): Promise<void> {
  const ctx = await requireContext();
  const update: Record<string, unknown> = { user_id: ctx.profile.id, updated_at: new Date().toISOString() };
  const meta: Record<string, unknown> = {};

  const jar = await cookies();
  const opts = { path: "/", maxAge: ONE_YEAR, sameSite: "lax" as const };

  if (input.theme !== undefined) {
    const theme = coerceTheme(input.theme);
    update.theme = theme;
    meta.theme = theme;
    jar.set(THEME_COOKIE, theme, opts);
  }
  if (input.accent !== undefined) {
    const accent = coerceAccent(input.accent);
    update.accent = accent;
    meta.accent = accent;
    jar.set(ACCENT_COOKIE, accent, opts);
  }

  const admin = createAdminClient();
  await admin.from("user_preferences").upsert(update, { onConflict: "user_id" });

  await logAuditEvent({
    userId: ctx.profile.id,
    action: "settings.appearance.changed",
    metadata: meta,
  });

  revalidatePath("/dashboard", "layout");
}
