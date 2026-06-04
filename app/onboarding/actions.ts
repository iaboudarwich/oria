"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ConversationEngine } from "@/lib/onboarding/conversation-engine";
import { generateSetupPlan } from "@/lib/onboarding/template-generator";
import { executeSetupPlan } from "@/lib/onboarding/plan-executor";
import type { OnboardingIntent } from "@/lib/onboarding/intents";
import {
  EMPTY_USER_CONTEXT,
  type ConversationState,
  type EngineStep,
  type SetupPlan,
  type UserContext,
} from "@/lib/onboarding/types";

/**
 * Advance the onboarding/reshape conversation: given the answers so far, return
 * the next question or the finished UserContext. Used by both the initial-setup
 * conversation (F1) and the reshape flow (F5, reconfigure mode).
 */
export async function onboardingNextStep(state: ConversationState): Promise<EngineStep> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { done: true, userContext: EMPTY_USER_CONTEXT };

  const locale = await getLocale();
  const engine = new ConversationEngine(state.mode ?? "initial_setup", locale);
  return engine.nextStep(state);
}

/** Turn a finished UserContext into a tailored, multi-space SetupPlan. */
export async function generateOnboardingPlan(userContext: UserContext): Promise<SetupPlan> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { spaces: [] };
  const locale = await getLocale();
  return generateSetupPlan(userContext, locale);
}

/** Build everything the (possibly user-edited) plan describes, in one go. The
 *  classified intent drives the personal org's template_key so the matching
 *  per-context surface renders (Round 14.9). */
export async function executeOnboardingPlan(
  plan: SetupPlan,
  intent?: OnboardingIntent,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const result = await executeSetupPlan({ userId: user.id, plan, source: "initial_setup", intent });
  if (result.ok) revalidatePath("/dashboard", "layout");
  return { ok: result.ok };
}

/** Dismiss the one-time onboarding reveal overlay (sets onboarding_completed_at). */
export async function dismissOnboardingReveal(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);
}
