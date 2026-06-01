import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResendButton } from "@/components/auth/resend-button";

export const metadata = { title: "Verify your email" };

type Props = { searchParams: Promise<{ email?: string }> };

export default async function VerifyPage({ searchParams }: Props) {
  const { email } = await searchParams;
  const t = await getTranslations("auth");

  return (
    <AuthShell
      title={t("verify_title")}
      subtitle={t("verify_body", { email: email ?? "your email" })}
    >
      {email ? <ResendButton email={email} /> : null}
    </AuthShell>
  );
}
