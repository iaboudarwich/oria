import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { PasswordField } from "@/components/auth/password-field";
import { updatePassword } from "@/lib/auth/actions";

export const metadata = { title: "Set a new password" };

type Props = { searchParams: Promise<{ error?: string }> };

export default async function ResetPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const t = await getTranslations("auth");
  const strengthLabels = t.raw("pw_strength") as [
    string,
    string,
    string,
    string,
    string,
  ];

  return (
    <AuthShell title={t("reset_title")} subtitle={t("reset_body")}>
      {error ? (
        <p className="mt-4 rounded-xl border border-claret/20 bg-claret/5 px-3.5 py-2.5 text-[13px] text-claret">
          {error}
        </p>
      ) : null}
      <form className="mt-6 space-y-3" action={updatePassword}>
        <PasswordField
          label={t("new_password_label")}
          name="password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          required
          minLength={8}
          showStrength
          strengthLabels={strengthLabels}
        />
        <Button type="submit" variant="primary" size="lg" className="w-full">
          {t("reset_submit")}
        </Button>
      </form>
    </AuthShell>
  );
}
