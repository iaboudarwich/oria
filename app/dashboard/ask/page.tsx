import { Topbar } from "@/components/dashboard/topbar";
import { AskChat } from "@/components/ask/ask-chat";
import {
  getCurrentContext,
  isAccountOwnerInPersonal,
  listUserSpaces,
} from "@/lib/data/organizations";
import { listRecentUserQuestions } from "@/lib/data/recent-questions";

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

  return (
    <>
      <Topbar title="Ask Oria" />
      <div className="mx-auto max-w-3xl">
        <AskChat
          crossSpaceAvailable={crossSpaceAvailable}
          recentQuestions={recentQuestions}
        />
      </div>
    </>
  );
}
