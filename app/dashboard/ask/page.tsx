import { Topbar } from "@/components/dashboard/topbar";
import { AskChat } from "@/components/ask/ask-chat";

export const metadata = { title: "Ask Oria" };

export default function AskPage() {
  return (
    <>
      <Topbar title="Ask Oria" />
      <div className="mx-auto max-w-3xl">
        <AskChat />
      </div>
    </>
  );
}
