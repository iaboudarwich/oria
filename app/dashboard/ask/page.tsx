import { Topbar } from "@/components/dashboard/topbar";
import { AskChat } from "@/components/ask/ask-chat";
import { ConversationSidebar } from "@/components/ask/conversation-sidebar";
import {
  getCurrentContext,
  isAccountOwnerInPersonal,
  listUserSpaces,
} from "@/lib/data/organizations";
import { listRecentUserQuestions } from "@/lib/data/recent-questions";
import { listConversations } from "@/lib/data/conversations";
import { Hint } from "@/components/onboarding/hint";
import { getSeenHintKeys } from "@/lib/data/onboarding";

export const metadata = { title: "Ask Oria" };

export default async function AskPage() {
  const [ctx, spaces, recentQuestions] = await Promise.all([
    getCurrentContext(),
    listUserSpaces(),
    listRecentUserQuestions({ surface: "ask", limit: 3 }),
  ]);
  // God's Eye toggle only renders when:
  //   • you're currently in your Personal space AND you own that space
  //     (the only configuration from which a global search is allowed
  //     by design), and
  //   • you actually have more than one space — otherwise there's
  //     nothing to span across.
  const crossSpaceAvailable =
    !!ctx && isAccountOwnerInPersonal(ctx) && spaces.length > 1;

  const [conversations, seenHints] = await Promise.all([
    ctx
      ? listConversations({ userId: ctx.profile.id, limit: 50 })
      : Promise.resolve([]),
    getSeenHintKeys(),
  ]);

  return (
    <>
      <Topbar title="Ask Oria" />
      <div className="flex gap-6">
        <ConversationSidebar conversations={conversations} />
        <div className="min-w-0 flex-1">
          <AskChat
            crossSpaceAvailable={crossSpaceAvailable}
            recentQuestions={recentQuestions}
          />
        </div>
      </div>
      <Hint
        hintKey="try_ask_oria"
        shouldShow={!seenHints.has("try_ask_oria")}
        title="Ask Oria anything"
        body="Type a question in plain English — about your documents, bills, reminders, or anything you've uploaded. Oria finds the answer from your own files."
      />
    </>
  );
}
