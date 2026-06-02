import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PreviewClient } from "./preview-client";

export const metadata = { title: "Your Oria" };
export const dynamic = "force-dynamic";

export default async function OnboardingPreviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <PreviewClient />;
}
