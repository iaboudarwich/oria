"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";
import { coerceDensity, coerceFontSize } from "@/lib/appearance/prefs";
import { DENSITY_COOKIE, FONT_SIZE_COOKIE } from "./appearance-prefs";

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
