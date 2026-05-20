import { redirect } from "next/navigation";

// Reminders folded into the unified Calendar. Preserve the old URL so any
// deep links (or muscle memory) still land somewhere useful.
export default function RemindersRedirect(): never {
  redirect("/dashboard/calendar");
}
