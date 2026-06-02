import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listGmailConnections } from "@/lib/integrations/gmail/connections";
import { listCloudConnectionsByService } from "@/lib/google/cloud-connections";
import { LinkClient } from "./link-client";

export const metadata = { title: "Connect your tools" };
export const dynamic = "force-dynamic";

export default async function OnboardingLinkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [gmail, calendar, drive] = await Promise.all([
    listGmailConnections(user.id),
    listCloudConnectionsByService(user.id, "calendar"),
    listCloudConnectionsByService(user.id, "drive"),
  ]);
  return (
    <LinkClient
      gmailConnected={gmail.length > 0}
      calendarConnected={calendar.length > 0}
      driveConnected={drive.length > 0}
    />
  );
}
