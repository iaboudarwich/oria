import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata = { title: "Recover account access" };

export default async function MfaRecoveryPage() {
  const t = await getTranslations("auth");

  return (
    <AuthShell title={t("recovery_title")}>
      <div className="mt-5 space-y-4 text-[13.5px] text-ink-soft">
        <div>
          <p className="font-medium text-ink">{t("recovery_backup_title")}</p>
          <p className="mt-1">{t("recovery_backup_body")}</p>
        </div>
        <div>
          <p className="font-medium text-ink">{t("recovery_none_title")}</p>
          <p className="mt-1">
            {t("recovery_none_body")}{" "}
            <a href="mailto:security@heyoria.com" className="text-brand hover:opacity-80">
              security@heyoria.com
            </a>
            .
          </p>
        </div>
      </div>
      <div className="mt-6 text-center">
        <Link href="/login/mfa" className="text-[12.5px] text-brand hover:opacity-80">
          {t("recovery_back")}
        </Link>
      </div>
    </AuthShell>
  );
}
