"use server";

import { createClient } from "@/lib/supabase/server";
import { deleteConversation, setConversationStarred } from "./conversations";
import { revalidatePath } from "next/cache";

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function deleteConversationAction(
  conversationId: string
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  // RLS ensures the row belongs to this user before soft-deleting
  await deleteConversation(conversationId);
  revalidatePath("/dashboard/ask");
}

export async function starConversationAction(
  conversationId: string,
  starred: boolean
): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  await setConversationStarred(conversationId, starred);
  revalidatePath("/dashboard/ask");
}
