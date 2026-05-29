import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WORKSPACE_TEMPLATES } from "@/lib/data/workspace-templates";
import { chooseTemplate } from "./actions";

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
            Pick a starting point. You can always add more sections later.
          </p>
        </div>

        {/* Main template cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {mainTemplates.map((t) => (
            <form key={t.key} action={chooseTemplate}>
              <input type="hidden" name="template" value={t.key} />
              <button
                type="submit"
                className="group w-full rounded-2xl border border-line bg-surface-raised p-5 text-left transition-base hover:border-accent hover:shadow-md"
              >
                <div className="mb-3 flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft/60 text-[18px]">
                    {templateEmoji(t.key)}
                  </span>
                  <span className="text-[15px] font-medium text-ink">{t.label}</span>
                </div>
                <p className="text-[13px] text-ink-muted">{t.description}</p>
                {t.section_seeds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {t.section_seeds.map((s) => (
                      <span
                        key={s.name}
                        className="rounded-md bg-canvas px-2 py-0.5 text-[11px] text-ink-faint border border-line"
                      >
                        {s.name}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </form>
          ))}
        </div>

        {/* Custom / Skip — de-emphasized */}
        <div className="mt-6 text-center">
          <form action={chooseTemplate}>
            <input type="hidden" name="template" value={customTemplate.key} />
            <button
              type="submit"
              className="text-[13px] text-ink-faint transition-base hover:text-ink hover:underline"
            >
              Skip for now — start with a blank workspace
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function templateEmoji(key: string): string {
  switch (key) {
    case "personal":      return "🏠";
    case "investor":      return "📈";
    case "business":      return "🏢";
    case "family_office": return "🏛️";
    default:              return "✨";
  }
}
