import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireContext } from "./organizations";
import type { Reminder } from "@/lib/supabase/types";

export async function listReminders(limit = 50): Promise<Reminder[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("reminders")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .order("done", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Reminder[];
}

export async function listOpenReminders(limit = 10): Promise<Reminder[]> {
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("reminders")
    .select("*")
    .eq("organization_id", ctx.organization.id)
    .eq("done", false)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as Reminder[];
}
