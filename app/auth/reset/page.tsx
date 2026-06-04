import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetClient } from "./reset-client";

export const metadata = { title: "Set a new password" };

export default async function ResetPage() {
  const t = await getTranslations("auth");
  const strengthLabels = t.raw("pw_strength") as [string, string, string, string, string];

  return (
    <AuthShell title={t("reset_title")} subtitle={t("reset_body")}>
      <ResetClient strengthLabels={strengthLabels} />
    </AuthShell>
  );
}
