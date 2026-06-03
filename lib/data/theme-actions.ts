"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { logAuditEvent } from "./audit-log";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Set the active space's theme variant (Round 14.5 F4). null clears the
 * override so the space inherits the user's global theme. Audited.
 */
export async function setSpaceThemeVariant(
  variant: "light" | "dark" | "system" | null,
): Promise<void> {
  const value =
    variant === "light" || variant === "dark" || variant === "system" ? variant : null;
  const ctx = await requireContext();
  const supabase = await createClient();
  await supabase
    .from("organizations")
    .update({ theme_variant: value })
    .eq("id", ctx.organization.id);
  void logAuditEvent({
    userId: ctx.profile.id,
    organizationId: ctx.organization.id,
    action: "space_theme_variant_updated",
    resourceType: "organization",
    resourceId: ctx.organization.id,
    metadata: { theme_variant: value },
  });
  revalidatePath("/dashboard", "layout");
}

/**
 * Update the active space's accent and shadow colors. Empty/invalid clears
 * the override (reverts to the template default). Stored on organizations.
 */
export async function setSpaceTheme(formData: FormData): Promise<void> {
  const rawAccent = String(formData.get("accent_color") ?? "").trim();
  const rawShadow = String(formData.get("shadow_color") ?? "").trim();
  const accent_color = HEX.test(rawAccent) ? rawAccent : null;
  const shadow_color = HEX.test(rawShadow) ? rawShadow : null;

  const ctx = await requireContext();
  const supabase = await createClient();
  await supabase
    .from("organizations")
    .update({ accent_color, shadow_color })
    .eq("id", ctx.organization.id);

  revalidatePath("/dashboard", "layout");
}
