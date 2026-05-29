import Link from "next/link";
import { Topbar } from "@/components/dashboard/topbar";
import {
  listEntityTypes,
  listEntities,
  countEntitiesByType,
} from "@/lib/data/entities";
import { requireContext } from "@/lib/data/organizations";

export const metadata = { title: "Things" };

export default async function ThingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp: Record<string, string | string[] | undefined> = await (searchParams ?? Promise.resolve({}));
  const ctx = await requireContext();
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
      <Topbar title="Things" />
      <div className="flex gap-6 animate-fade-up">
        {/* Sidebar */}
        <aside className="hidden w-48 shrink-0 lg:block">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              Types
            </p>
            <Link
              href="/dashboard/things/new-type"
              className="text-[11px] text-ink-faint hover:text-ink transition-base"
            >
              + Add
            </Link>
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
            <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
              <p className="text-[14px] font-medium text-ink">
                Create your first entity type
              </p>
              <p className="mt-1 text-[13px] text-ink-muted">
                Track anything: cars, properties, vendors, art, equipment.
              </p>
              <Link
                href="/dashboard/things/new-type"
                className="mt-4 inline-flex h-10 items-center rounded-xl bg-ink px-4 text-[13px] text-surface hover:bg-ink-soft transition-base"
              >
                Create a type
              </Link>
            </div>
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
                <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
                  <p className="text-[13px] text-ink-faint">
                    No {activeType.label_plural.toLowerCase()} yet.
                  </p>
                  <Link
                    href={`/dashboard/things/new?type=${activeType.id}`}
                    className="mt-2 inline-block text-[12px] text-ink-muted hover:text-ink"
                  >
                    Add one
                  </Link>
                </div>
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
