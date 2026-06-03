import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Topbar } from "@/components/dashboard/topbar";
import { EmptyState } from "@/components/ui/empty-state";
import { BoxIcon } from "@/components/ui/icon";
import { resolveThingsLabel } from "@/lib/data/things-label";
import { ThingsRename } from "@/components/things/things-rename";
import {
  listEntityTypes,
  listEntities,
  countEntitiesByType,
} from "@/lib/data/entities";
import { requireContext } from "@/lib/data/organizations";

export const metadata = { title: "Items" };

export default async function ThingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp: Record<string, string | string[] | undefined> = await (searchParams ?? Promise.resolve({}));
  const t = await getTranslations("empty");
  const ctx = await requireContext();
  const thingsLabel = resolveThingsLabel(ctx.organization);
  const [types, counts] = await Promise.all([
    listEntityTypes(),
    countEntitiesByType(ctx.organization.id),
  ]);

  const activeTypeId =
    typeof sp.type === "string" && sp.type ? sp.type : types[0]?.id ?? null;

  const entities = activeTypeId
    ? await listEntities(activeTypeId)
    : [];

  const activeType = types.find((t) => t.id === activeTypeId);

  return (
    <>
      <Topbar title={thingsLabel} />
      <div className="flex gap-6 animate-fade-up">
        {/* Sidebar */}
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-eyebrow">Types</p>
            <Link
              href="/dashboard/things/new-type"
              className="text-[11px] text-ink-faint hover:text-ink transition-base"
            >
              + Add
            </Link>
          </div>
          <div className="mb-3 px-1">
            <ThingsRename label={thingsLabel} />
          </div>
          <ul className="space-y-0.5">
            {types.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/dashboard/things?type=${t.id}`}
                  className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] transition-base ${
                    t.id === activeTypeId
                      ? "bg-surface-raised text-ink font-medium"
                      : "text-ink-muted hover:bg-canvas/60 hover:text-ink"
                  }`}
                >
                  <span className="flex-1 truncate">{t.label_plural}</span>
                  {counts[t.id] ? (
                    <span className="shrink-0 text-[10.5px] text-ink-faint">
                      {counts[t.id]}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
            {types.length === 0 && (
              <li className="px-2 text-[12px] text-ink-faint">
                No types yet.
              </li>
            )}
          </ul>
        </aside>

        {/* Main area */}
        <div className="min-w-0 flex-1">
          {!activeType ? (
            <EmptyState
              icon={<BoxIcon size={22} />}
              headline={t("things_headline")}
              description={t("things_desc")}
              cta={{ label: t("things_cta"), href: "/dashboard/inbox" }}
            />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[16px] font-semibold text-ink">
                  {activeType.label_plural}
                </h2>
                <Link
                  href={`/dashboard/things/new?type=${activeType.id}`}
                  className="inline-flex h-9 items-center rounded-lg bg-ink px-3 text-[12.5px] text-surface hover:bg-ink-soft transition-base"
                >
                  + Add {activeType.label_singular}
                </Link>
              </div>

              {entities.length === 0 ? (
                <EmptyState
                  compact
                  headline={t("things_type_empty")}
                  cta={{
                    label: `+ ${activeType.label_singular}`,
                    href: `/dashboard/things/new?type=${activeType.id}`,
                  }}
                />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {entities.map((e) => {
                    const keyFields = (activeType.field_schema ?? []).slice(0, 2);
                    return (
                      <li key={e.id}>
                        <Link
                          href={`/dashboard/things/${e.id}`}
                          className="block rounded-2xl border border-line bg-surface-raised p-4 transition-base hover:border-line-strong hover:shadow-sm"
                        >
                          <p className="font-medium text-[14px] text-ink truncate">
                            {e.name}
                          </p>
                          {keyFields.map((f) => {
                            const v = e.details[f.key];
                            if (!v) return null;
                            return (
                              <p
                                key={f.key}
                                className="mt-0.5 text-[12px] text-ink-faint truncate"
                              >
                                {f.label}: {String(v)}
                              </p>
                            );
                          })}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
