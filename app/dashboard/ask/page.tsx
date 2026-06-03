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
import { getLocale } from "next-intl/server";
import { suggestedQuestions } from "@/lib/ai/suggested-questions";
import { getUserProfile } from "@/lib/data/user-profile";
import { personalizeQuestions } from "@/lib/ai/personalization";
import { getAiConnection, getReasoningMode } from "@/lib/data/ai-connections";
import { PoweredBy } from "@/components/ai/powered-by";
import type { Locale } from "@/i18n/config";

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
  //   • you actually have more than one space. otherwise there's
  //     nothing to span across.
  const crossSpaceAvailable =
    !!ctx && isAccountOwnerInPersonal(ctx) && spaces.length > 1;

  const [conversations, seenHints, locale, aiConnection, reasoningMode] = await Promise.all([
    ctx
      ? listConversations({ userId: ctx.profile.id, limit: 50 })
      : Promise.resolve([]),
    getSeenHintKeys(),
    getLocale(),
    ctx?.profile.id ? getAiConnection(ctx.profile.id) : Promise.resolve(null),
    ctx?.profile.id ? getReasoningMode(ctx.profile.id) : Promise.resolve("auto" as const),
  ]);

  // Space-aware starter questions: Personal vs Work vs Investor vs Family
  // Office show different prompts, in the account language. Then weighted
  // toward the sections this user actually engages with (personalization).
  let suggestions: string[] | undefined;
  if (ctx) {
    const base = suggestedQuestions(
      {
        template: ctx.organization.template_key,
        parentKind: ctx.organization.parent_kind,
        kind: ctx.organization.kind,
      },
      locale as Locale,
    );
    const profile = await getUserProfile(ctx.profile.id);
    suggestions = personalizeQuestions(
      base,
      profile.derived.topSections.map((s) => s.key),
      locale as Locale,
    );
  }

  return (
    <>
      <Topbar title="Ask Oria" />
      {/* Two-column layout from md up: the history panel takes its own
          in-flow column and the chat reflows into the remaining width
          (min-w-0). Below md the panel is an off-screen overlay with a
          toggle, so it never sits on top of the chat in normal flow. */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <ConversationSidebar conversations={conversations} />
        <div className="relative min-w-0 flex-1">
          <AskChat
            crossSpaceAvailable={crossSpaceAvailable}
            recentQuestions={recentQuestions}
            suggestions={suggestions}
            spaceName={ctx?.organization.name ?? null}
            reasoningMode={reasoningMode}
          />
          <PoweredBy provider={aiConnection?.provider ?? null} reasoning={reasoningMode === "always"} />
        </div>
      </div>
      <Hint
        hintKey="try_ask_oria"
        shouldShow={!seenHints.has("try_ask_oria")}
        title="Ask Oria anything"
        body="Type a question in plain English about your documents, bills, reminders, or anything you've uploaded. Oria finds the answer from your own files."
      />
    </>
  );
}
