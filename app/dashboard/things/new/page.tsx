import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import { getEntityType } from "@/lib/data/entities";
import { createEntity } from "@/lib/data/entity-actions";

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewEntityPage({ searchParams }: Props) {
  const sp: Record<string, string | string[] | undefined> = await (searchParams ??
    Promise.resolve({}));
  const typeId = typeof sp.type === "string" ? sp.type : null;
  if (!typeId) notFound();

  const entityType = await getEntityType(typeId);
  if (!entityType) notFound();

  return (
    <>
      <Topbar title={`New ${entityType.label_singular}`} />
      <div className="animate-fade-up mx-auto max-w-lg">
        <form action={createEntity} className="space-y-5">
          <input type="hidden" name="entity_type_id" value={entityType.id} />

          <div>
            <label className="mb-1 block text-[13px] text-ink">Name</label>
            <input
              type="text"
              name="name"
              required
              autoFocus
              className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
            />
          </div>

          {(entityType.field_schema ?? []).map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-[13px] text-ink-muted">
                {f.label}
                {f.required ? " *" : ""}
              </label>
              {f.type === "long_text" ? (
                <textarea
                  name={`field_${f.key}`}
                  required={f.required}
                  rows={3}
                  className="block w-full rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
                />
              ) : f.type === "boolean" ? (
                <select
                  name={`field_${f.key}`}
                  className="block h-10 w-full rounded-xl border border-line bg-surface-raised px-3 text-[14px] text-ink outline-none focus:border-ink"
                >
                  <option value="">--</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              ) : f.type === "enum" && f.options ? (
                <select
                  name={`field_${f.key}`}
                  required={f.required}
                  className="block h-10 w-full rounded-xl border border-line bg-surface-raised px-3 text-[14px] text-ink outline-none focus:border-ink"
                >
                  <option value="">--</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={
                    f.type === "number" || f.type === "currency"
                      ? "number"
                      : f.type === "date"
                        ? "date"
                        : "text"
                  }
                  name={`field_${f.key}`}
                  required={f.required}
                  step={f.type === "currency" ? "0.01" : undefined}
                  className="block h-10 w-full rounded-xl border border-line bg-surface-raised px-3.5 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
                />
              )}
            </div>
          ))}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="transition-base inline-flex h-11 items-center rounded-xl bg-ink px-5 text-[13.5px] text-surface hover:bg-ink-soft"
            >
              Create {entityType.label_singular}
            </button>
            <Link
              href={`/dashboard/things?type=${typeId}`}
              className="transition-base text-[13px] text-ink-muted hover:text-ink"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
