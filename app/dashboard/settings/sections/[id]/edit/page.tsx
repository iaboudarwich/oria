import Link from "next/link";
import { notFound } from "next/navigation";
import { Topbar } from "@/components/dashboard/topbar";
import { renameCustomSection } from "@/lib/data/custom-section-actions";
import { getCustomSectionById } from "@/lib/data/custom-sections";

export const metadata = { title: "Edit section" };

type Props = { params: Promise<{ id: string }> };

export default async function EditSectionPage({ params }: Props) {
  const { id } = await params;
  const section = await getCustomSectionById(id);
  if (!section) notFound();

  return (
    <>
      <Topbar title="Edit section" />

      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/dashboard/settings"
          className="transition-base inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          <span className="-ml-0.5">←</span> Settings
        </Link>
      </div>

      <form action={renameCustomSection} className="max-w-md space-y-4">
        <input type="hidden" name="id" value={section.id} />
        <label className="block">
          <span className="mb-1.5 block text-[12px] text-ink-muted">Name</span>
          <input
            type="text"
            name="name"
            defaultValue={section.name}
            required
            maxLength={60}
            className="transition-base block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink outline-none focus:border-ink"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="transition-base inline-flex h-11 items-center rounded-xl bg-ink px-5 text-[13.5px] text-surface hover:bg-ink-soft"
          >
            Save
          </button>
          <Link
            href="/dashboard/settings"
            className="transition-base text-[13px] text-ink-muted hover:text-ink"
          >
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
