import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listGmailConnections } from "@/lib/integrations/gmail/connections";
import { listCloudConnectionsByService } from "@/lib/google/cloud-connections";
import { listOutlookConnections } from "@/lib/microsoft/connections";
import { getAiConnection } from "@/lib/data/ai-connections";
import { LinkClient } from "./link-client";

export const metadata = { title: "Connect your tools" };
export const dynamic = "force-dynamic";

export default async function OnboardingLinkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [gmail, calendar, drive, outlook, onedrive, ai] = await Promise.all([
    listGmailConnections(user.id),
    listCloudConnectionsByService(user.id, "calendar"),
    listCloudConnectionsByService(user.id, "drive"),
    listOutlookConnections(user.id),
    listCloudConnectionsByService(user.id, "onedrive"),
    getAiConnection(user.id),
  ]);
  return (
    <LinkClient
      gmailConnected={gmail.length > 0}
      calendarConnected={calendar.length > 0}
      driveConnected={drive.length > 0}
      outlookConnected={outlook.length > 0}
      onedriveConnected={onedrive.length > 0}
      aiProvider={ai?.provider ?? null}
    />
  );
}
