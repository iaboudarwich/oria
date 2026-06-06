import { Topbar } from "@/components/dashboard/topbar";
import { getTranslations } from "next-intl/server";
import { ReshapeClient } from "./reshape-client";

export const metadata = { title: "Reshape Oria" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReshapePage({ searchParams }: Props) {
  const sp: Record<string, string | string[] | undefined> = await (searchParams ??
    Promise.resolve({}));
  const intent = typeof sp.intent === "string" ? sp.intent : undefined;
  const t = await getTranslations("reshape");
  return (
    <>
      <Topbar title={t("title")} />
      <ReshapeClient initialIntent={intent} />
    </>
  );
}
