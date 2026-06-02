import { redirect } from "next/navigation";

// The AI settings live as a tab in the main settings page. This sub-route is a
// stable deep link (used by the powered-by indicator, the fallback toast, and
// the feature index) that lands on that tab.
export default function AiSettingsRedirect() {
  redirect("/dashboard/settings?tab=ai");
}
