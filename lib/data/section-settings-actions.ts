"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import { listAllSections, isSameRef, type SectionRef } from "./all-sections";
import type { Section } from "@/lib/supabase/types";

function readRef(formData: FormData): SectionRef | null {
  const kind = String(formData.get("kind") ?? "");
  const key = String(formData.get("key") ?? "");
  if (!key) return null;
  if (kind === "builtin") return { kind: "builtin", key: key as Section };
  if (kind === "custom") return { kind: "custom", key };
  return null;
}

function revalidateSections() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  revalidatePath("/dashboard/settings");
}

async function upsertSetting(
  ref: SectionRef,
  values: { sort_order?: number; hidden?: boolean },
): Promise<void> {
  const ctx = await requireContext();
  const supabase = await createClient();

  // Try update first; if no row exists, insert.
  const match = supabase
    .from("section_settings")
    .select("id")
    .eq("organization_id", ctx.organization.id);
  const existing =
    ref.kind === "builtin"
      ? await match.eq("builtin_section", ref.key).maybeSingle()
      : await match.eq("custom_section_id", ref.key).maybeSingle();

  if (existing.data) {
    const id = (existing.data as { id: string }).id;
    await supabase.from("section_settings").update(values).eq("id", id);
  } else {
    await supabase.from("section_settings").insert({
      organization_id: ctx.organization.id,
      builtin_section: ref.kind === "builtin" ? ref.key : null,
      custom_section_id: ref.kind === "custom" ? ref.key : null,
      sort_order: values.sort_order ?? 0,
      hidden: values.hidden ?? false,
    });
  }
}

export async function moveSection(formData: FormData): Promise<void> {
  const ref = readRef(formData);
  const dir = String(formData.get("dir") ?? "");
  if (!ref || (dir !== "up" && dir !== "down")) return;

  const sections = await listAllSections({
    includeHidden: true,
    includeReview: false,
  });
  const i = sections.findIndex((s) => isSameRef(s.ref, ref));
  if (i === -1) return;
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= sections.length) return;

  const reordered = [...sections];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];

  // Persist the new positions of every section so the order is stable and
  // doesn't depend on whatever default the next round of code thinks it is.
  // For ~20 rows this is fast.
  await Promise.all(
    reordered.map((m, k) =>
      upsertSetting(m.ref, { sort_order: k * 10, hidden: m.hidden }),
    ),
  );

  revalidateSections();
}

export async function toggleSectionHidden(formData: FormData): Promise<void> {
  const ref = readRef(formData);
  if (!ref) return;

  const sections = await listAllSections({
    includeHidden: true,
    includeReview: false,
  });
  const current = sections.find((s) => isSameRef(s.ref, ref));
  if (!current) return;

  await upsertSetting(ref, {
    sort_order: current.sort_order,
    hidden: !current.hidden,
  });

  revalidateSections();
}
