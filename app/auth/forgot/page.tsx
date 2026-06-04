import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotClient } from "./forgot-client";

export const metadata = { title: "Reset your password" };

type Props = { searchParams: Promise<{ email?: string }> };

export default async function ForgotPage({ searchParams }: Props) {
  const { email } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <AuthShell title={t("forgot_title")} subtitle={t("forgot_body")}>
      <ForgotClient defaultEmail={email} />
    </AuthShell>
  );
}
