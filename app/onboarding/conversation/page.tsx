import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ConversationClient } from "./conversation-client";

export const metadata = { title: "Set up Oria" };
export const dynamic = "force-dynamic";

export default async function OnboardingConversationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <ConversationClient />;
}
