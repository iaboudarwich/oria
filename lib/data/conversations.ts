import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type Conversation = {
  id: string;
  created_by: string;
  organization_id: string | null;
  title: string | null;
  starred: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

/**
 * Create a new conversation and return its id. Title is derived from
 * the first user message (truncated to 60 chars) at creation time so
 * there's no extra round-trip later.
 */
export async function createConversation(input: {
  userId: string;
  organizationId?: string | null;
  firstMessage: string;
}): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const title = input.firstMessage.trim().slice(0, 60) || null;
    const { data } = await admin
      .from("conversations")
      .insert({
        created_by: input.userId,
        organization_id: input.organizationId ?? null,
        title,
      })
      .select("id")
      .single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Append a message to an existing conversation. Best-effort. never
 * throws so a persistence failure never breaks the chat stream.
 */
export async function addMessage(input: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("messages").insert({
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
    });
  } catch {
    // Best-effort
  }
}

/**
 * List non-deleted conversations for a user. Returns newest-first,
 * capped at 50. Used to populate the sidebar.
 */
export async function listConversations(input: {
  userId: string;
  starredOnly?: boolean;
  limit?: number;
}): Promise<Conversation[]> {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("conversations")
      .select("*")
      .eq("created_by", input.userId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(input.limit ?? 50);
    if (input.starredOnly) q = q.eq("starred", true);
    const { data } = await q;
    return (data ?? []) as Conversation[];
  } catch {
    return [];
  }
}

/**
 * Load a single conversation (ownership check via RLS) plus all its
 * messages in chronological order.
 */
export async function getConversationWithMessages(
  conversationId: string
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  try {
    const supabase = await createClient();
    const { data: conv } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .is("deleted_at", null)
      .single();
    if (!conv) return null;

    const { data: msgs } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    return {
      conversation: conv as Conversation,
      messages: ((msgs ?? []) as Message[]),
    };
  } catch {
    return null;
  }
}

/**
 * Soft-delete a conversation. Cascades to messages are handled at DB
 * level; the row stays for audit purposes.
 */
export async function deleteConversation(
  conversationId: string
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase
      .from("conversations")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", conversationId);
  } catch {
    // Best-effort
  }
}

/**
 * Toggle the starred flag on a conversation.
 */
export async function setConversationStarred(
  conversationId: string,
  starred: boolean
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase
      .from("conversations")
      .update({ starred })
      .eq("id", conversationId);
  } catch {
    // Best-effort
  }
}
