import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_TEMPLATES } from "@/lib/data/workspace-templates";
import { TemplatePicker } from "@/components/onboarding/template-picker";
import { chooseTemplates } from "./actions";

export const metadata = { title: "Choose a template" };

export default async function OnboardingTemplatePage() {
  // If the user isn't signed in, send to login.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If the user already has a template chosen, they don't need this page.
  const { data: memberships } = await supabase
    .from("memberships")
    .select("organization_id, organizations(id, kind, template_key)")
    .eq("user_id", user.id);
  const personal = (memberships ?? []).find((m) => {
    const org = (m as Record<string, unknown>).organizations as Record<string, unknown> | null;
    return org?.kind === "personal";
  });
  const alreadyChosen =
    personal &&
    !!(
      (personal as Record<string, unknown>).organizations as Record<string, unknown> | null
    )?.template_key;
  if (alreadyChosen) redirect("/dashboard");

  const mainTemplates = WORKSPACE_TEMPLATES.filter((t) => t.key !== "custom");
  const customTemplate = WORKSPACE_TEMPLATES.find((t) => t.key === "custom")!;

  return (
    <main className="min-h-screen bg-canvas px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center">
          <h1 className="text-[28px] font-semibold tracking-tight text-ink">
            What are you using Oria for?
          </h1>
          <p className="mt-2 text-[14px] text-ink-muted">
            Pick one or more starting points. You can always add more
            sections later.
          </p>
        </div>

        <TemplatePicker
          templates={mainTemplates}
          customTemplate={customTemplate}
          onSubmit={chooseTemplates}
        />
      </div>
    </main>
  );
}
