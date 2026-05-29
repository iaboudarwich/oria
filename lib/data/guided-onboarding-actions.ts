"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getOnboardingResponse, getOpeningMessage } from "@/lib/ai/guided-onboarding";
import type { OnboardingTurn, OnboardingAIResponse, OnboardingSuggestions } from "@/lib/ai/guided-onboarding";

type StartResult = {
  sessionId: string;
  firstMessage: OnboardingAIResponse;
};

export async function startOnboarding(
  organizationId: string,
  mode: "first" | "improve" | "reprompt",
): Promise<StartResult | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const firstMessage = getOpeningMessage(mode);

  const { data } = await supabase
    .from("onboarding_sessions")
    .insert({
      user_id: user.id,
      organization_id: organizationId,
      mode,
      status: "in_progress",
      turns: [{ role: "assistant", content: firstMessage.next_message }],
    })
    .select("id")
    .single();

  if (!data) return null;
  return { sessionId: (data as { id: string }).id, firstMessage };
}

export async function continueOnboarding(
  sessionId: string,
  userMessage: string,
): Promise<OnboardingAIResponse | null> {
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("onboarding_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("status", "in_progress")
    .maybeSingle();

  if (!session) return null;

  const turns = (session.turns as OnboardingTurn[]) ?? [];
  turns.push({ role: "user", content: userMessage });

  const aiResponse = await getOnboardingResponse(
    turns,
    session.mode as "first" | "improve" | "reprompt",
  );
  turns.push({ role: "assistant", content: aiResponse.next_message });

  const update: Record<string, unknown> = { turns };
  if (aiResponse.is_final && aiResponse.suggestions) {
    update.final_suggestions = aiResponse.suggestions;
  }

  await supabase
    .from("onboarding_sessions")
    .update(update)
    .eq("id", sessionId);

  return aiResponse;
}

export async function applyOnboarding(
  sessionId: string,
  accepted: {
    sections: string[]; // accepted section names
    entityTypeKeys: string[]; // accepted entity type keys
    entityNames: string[]; // accepted entity sample names
    trackableCategories: string[];
  },
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: session } = await supabase
    .from("onboarding_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!session) return;

  const suggestions = session.final_suggestions as OnboardingSuggestions | null;
  if (!suggestions) return;

  const admin = createAdminClient();
  const orgId = session.organization_id as string;

  // Create accepted sections
  for (const secName of accepted.sections) {
    const sec = suggestions.sections.find((s) => s.name === secName);
    if (!sec) continue;
    await admin
      .from("custom_sections")
      .insert({ organization_id: orgId, name: sec.name, icon: sec.icon, created_by: user.id })
      .select()
      .maybeSingle();
  }

  // Create accepted entity types
  const createdTypeIds: Record<string, string> = {};
  for (const key of accepted.entityTypeKeys) {
    const et = suggestions.entity_types.find((t) => t.key === key);
    if (!et) continue;
    const { data } = await admin
      .from("entity_types")
      .upsert(
        {
          organization_id: orgId,
          key: et.key,
          label_singular: et.label_plural.replace(/s$/, ""),
          label_plural: et.label_plural,
          field_schema: et.suggested_fields,
          is_seeded: false,
          created_by: user.id,
        },
        { onConflict: "organization_id,key" },
      )
      .select("id")
      .maybeSingle();
    if (data) createdTypeIds[key] = (data as { id: string }).id;
  }

  // Create accepted sample entities
  for (const entityName of accepted.entityNames) {
    const sample = suggestions.entities.find((e) => e.name === entityName);
    if (!sample) continue;
    const typeId = createdTypeIds[sample.entity_type_key];
    if (!typeId) continue;
    await admin.from("entities").insert({
      organization_id: orgId,
      entity_type_id: typeId,
      name: sample.name,
      details: sample.prefill_fields ?? {},
      created_by: user.id,
    });
  }

  // Mark session complete + profile updated
  await supabase
    .from("onboarding_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      applied_suggestions: accepted,
    })
    .eq("id", sessionId);

  await supabase
    .from("profiles")
    .update({ has_completed_guided_onboarding: true })
    .eq("id", user.id);

  revalidatePath("/dashboard", "layout");
}

export async function skipOnboarding(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("onboarding_sessions")
    .update({ status: "abandoned" })
    .eq("id", sessionId)
    .eq("user_id", user.id);

  await supabase
    .from("profiles")
    .update({ has_completed_guided_onboarding: true })
    .eq("id", user.id);

  revalidatePath("/dashboard", "layout");
}

export async function dismissReprompt(
  duration: "7d" | "permanent",
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  if (duration === "permanent") {
    await supabase
      .from("profiles")
      .update({ onboarding_reprompt_permanent_dismiss: true })
      .eq("id", user.id);
  } else {
    const until = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await supabase
      .from("profiles")
      .update({ onboarding_reprompt_dismissed_until: until })
      .eq("id", user.id);
  }
  revalidatePath("/dashboard", "layout");
}
