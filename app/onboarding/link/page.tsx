import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listGmailConnections } from "@/lib/integrations/gmail/connections";
import { LinkClient } from "./link-client";

export const metadata = { title: "Connect your tools" };
export const dynamic = "force-dynamic";

export default async function OnboardingLinkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const connections = await listGmailConnections(user.id);
  return <LinkClient gmailConnected={connections.length > 0} />;
}
