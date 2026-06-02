import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DemoClient } from "./demo-client";

export const metadata = { title: "Welcome to Oria" };
export const dynamic = "force-dynamic";

export default async function OnboardingDemoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <DemoClient />;
}
