"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";

/**
 * Rename the "Things" area for the current space. Empty/blank clears the
 * override and reverts to the template default (or "Things"). Stored on
 * organizations.things_label.
 */
export async function setThingsLabel(formData: FormData): Promise<void> {
  const raw = String(formData.get("label") ?? "").trim();
  const label = raw.length > 0 ? raw.slice(0, 40) : null;

  const ctx = await requireContext();
  const supabase = await createClient();
  await supabase
    .from("organizations")
    .update({ things_label: label })
    .eq("id", ctx.organization.id);

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/things");
}
