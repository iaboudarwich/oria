import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MicIcon } from "@/components/ui/icon";

/**
 * The accent "Talk to Oria" cube on the home (matches docs/design/home-target).
 * One mint-filled tile linking into Ask, where voice + text both live. The
 * home capture bar already carries a mic for quick voice; this is the calm,
 * always-there invitation to a full conversation. Ink-on-accent uses the
 * --accent-ink token so it stays readable in both themes.
 */
export async function TalkCube() {
  const t = await getTranslations("home");
  return (
    <Link
      href="/dashboard/ask"
      className="transition-base flex items-center gap-3 rounded-tile bg-brand px-4 py-3.5 text-accent-ink shadow-soft hover:opacity-95"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/15">
        <MicIcon size={19} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{t("talk_title")}</span>
        <span className="block text-[12px] opacity-80">{t("talk_sub")}</span>
      </span>
    </Link>
  );
}
