import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingChatClient } from "./client";
import { startOnboarding } from "@/lib/data/guided-onboarding-actions";

export const metadata = { title: "Set up Oria" };

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OnboardingChatPage({ searchParams }: Props) {
  const sp: Record<string, string | string[] | undefined> = await (
    searchParams ?? Promise.resolve({})
  );
  const mode = (String(sp.mode ?? "first")) as "first" | "improve" | "reprompt";
  const workspaceId = typeof sp.workspace === "string" ? sp.workspace : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get active org
  const { data: memberRows } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const orgId =
    workspaceId ??
    (memberRows?.[0] as { organization_id: string } | undefined)?.organization_id ??
    null;
  if (!orgId) redirect("/dashboard");

  // Start session server-side so first message is available immediately
  const session = await startOnboarding(orgId, mode);
  if (!session) redirect("/dashboard");

  return (
    <Suspense fallback={null}>
      <OnboardingChatClient
        sessionId={session.sessionId}
        firstMessage={session.firstMessage}
        mode={mode}
      />
    </Suspense>
  );
}
