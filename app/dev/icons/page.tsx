import { notFound } from "next/navigation";
import { ALL_ICONS } from "@/components/ui/icon";

/**
 * Dev-only icon gallery. Visual-QA aid for the Lucide migration (round 14.5c):
 * renders every Oria icon at the sizes the app actually uses, plus an RTL strip
 * so directional mirroring can be eyeballed. There is no rendered-output channel
 * in CI, so this page is the human check.
 *
 * Hard-gated: in a production build NODE_ENV is "production" and the route 404s,
 * so it can never be reached by real users. It stays as a permanent internal
 * reference for development.
 */

export const metadata = { title: "Icon gallery (dev)" };

// The sizes icons are rendered at across the app, smallest to largest.
const USED_SIZES = [13, 14, 16, 18, 20, 22];

const DIRECTIONAL = ALL_ICONS.filter((i) => i.Comp.iconMeta.directional);

export default function IconGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-[20px] font-semibold text-ink">Icon gallery</h1>
      <p className="mt-1 text-[13px] text-ink-muted">
        {ALL_ICONS.length} icons. Dev-only. Each row shows one icon across the sizes used in the
        app, with its default size highlighted.
      </p>

      <section className="mt-8">
        <h2 className="text-eyebrow mb-3">All icons</h2>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-surface-raised text-ink-muted">
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium">Default</th>
                {USED_SIZES.map((s) => (
                  <th key={s} className="px-3 py-2 text-center font-medium">
                    {s}px
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-medium">Dir</th>
              </tr>
            </thead>
            <tbody>
              {ALL_ICONS.map(({ name, Comp }) => (
                <tr key={name} className="border-t border-line">
                  <td className="px-3 py-2 font-mono text-ink">{name}</td>
                  <td className="px-3 py-2 text-ink-faint">{Comp.iconMeta.defaultSize}px</td>
                  {USED_SIZES.map((s) => (
                    <td key={s} className="px-3 py-2 text-center text-ink">
                      <span className="inline-flex items-center justify-center">
                        <Comp size={s} />
                      </span>
                    </td>
                  ))}
                  <td className="px-3 py-2 text-center text-ink-faint">
                    {Comp.iconMeta.directional ? "↔" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-eyebrow mb-3">Directional icons under RTL</h2>
        <p className="mb-3 text-[12.5px] text-ink-muted">
          Left column is LTR, right column is RTL. Directional icons should mirror; nothing else
          should.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-line p-4" dir="ltr">
            <p className="text-eyebrow mb-3">dir=ltr</p>
            <div className="flex flex-wrap gap-4">
              {DIRECTIONAL.map(({ name, Comp }) => (
                <span key={name} className="flex flex-col items-center gap-1 text-ink">
                  <Comp size={20} />
                  <span className="text-[10px] text-ink-faint">{name.replace("Icon", "")}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-line p-4" dir="rtl">
            <p className="text-eyebrow mb-3">dir=rtl</p>
            <div className="flex flex-wrap gap-4">
              {DIRECTIONAL.map(({ name, Comp }) => (
                <span key={name} className="flex flex-col items-center gap-1 text-ink">
                  <Comp size={20} />
                  <span className="text-[10px] text-ink-faint">{name.replace("Icon", "")}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
