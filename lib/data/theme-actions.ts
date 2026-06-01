"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";

const HEX = /^#[0-9a-fA-F]{6}$/;

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
