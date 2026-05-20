import { Topbar } from "@/components/dashboard/topbar";
import { AskChat } from "@/components/ask/ask-chat";
import {
  getCurrentContext,
  listUserSpaces,
} from "@/lib/data/organizations";

export const metadata = { title: "Ask Oria" };

export default async function AskPage() {
  const [ctx, spaces] = await Promise.all([
    getCurrentContext(),
    listUserSpaces(),
  ]);
  // God's Eye toggle only renders when:
  //   • you're currently in your Personal space (the only place from
  //     which a global search is allowed by design), and
  //   • you actually have more than one space — otherwise there's
  //     nothing to span across.
  const crossSpaceAvailable =
    ctx?.organization.kind === "personal" && spaces.length > 1;

  return (
    <>
      <Topbar title="Ask Oria" />
      <div className="mx-auto max-w-3xl">
        <AskChat crossSpaceAvailable={crossSpaceAvailable} />
      </div>
    </>
  );
}
