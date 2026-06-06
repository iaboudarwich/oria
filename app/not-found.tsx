import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-raised p-8 text-center shadow-sm">
        <div className="flex justify-center">
          <Wordmark href="/" />
        </div>
        <p className="text-headline mt-6 text-ink">404</p>
        <p className="text-body mt-2 text-ink-soft">{t("notFound_title")}</p>
        <div className="mt-6 flex justify-center">
          <Button href="/dashboard" variant="primary">
            {t("notFound_back")}
          </Button>
        </div>
      </div>
    </main>
  );
}
