import { DemoTopbar } from "@/components/demo/demo-shell";
import { Badge, Dot } from "@/components/ui/badge";
import { ArrowRightIcon } from "@/components/ui/icon";

export const metadata = { title: "Principal" };

export default function PrincipalRolePage() {
  return (
    <>
      <DemoTopbar title="Today" />

      <div className="animate-fade-up space-y-6">
        <Stats />
        <Approvals />
        <Suggestion />
        <Houses />
      </div>
    </>
  );
}

function Stats() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { k: "Needs you", v: "3" },
        { k: "Houses quiet", v: "4 / 4" },
        { k: "People active", v: "11" },
        { k: "Flagged", v: "1" },
      ].map((t) => (
        <div key={t.k} className="rounded-xl border border-line bg-surface-raised p-4">
          <p className="text-[11.5px] text-ink-faint">{t.k}</p>
          <p className="mt-1.5 text-[22px] font-semibold text-ink">{t.v}</p>
        </div>
      ))}
    </div>
  );
}

function Approvals() {
  const items = [
    {
      label: "Stradivarius restoration",
      meta: "9 days waiting, CHF 48,200",
      tone: "claret" as const,
      tag: "Overdue",
    },
    {
      label: "Art transit insurance",
      meta: "Binds tomorrow, CHF 12,400",
      tone: "champagne" as const,
      tag: "Tomorrow",
    },
    {
      label: "Mendez May overtime",
      meta: "Seasonal, CHF 3,180",
      tone: "neutral" as const,
      tag: "48h",
    },
  ];
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Needs your signature</h2>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface-raised">
        {items.map((it) => (
          <li
            key={it.label}
            className="transition-base flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-canvas/60"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-ink">{it.label}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-muted">{it.meta}</p>
            </div>
            <Badge tone={it.tone}>{it.tag}</Badge>
            <div className="flex items-center gap-2">
              <button className="transition-base inline-flex h-8 items-center rounded-lg bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft">
                Approve
              </button>
              <button className="transition-base inline-flex h-8 items-center rounded-lg border border-line bg-surface-raised px-3 text-[12px] text-ink-muted hover:border-line-strong hover:text-ink">
                Defer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Suggestion() {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-5">
      <p className="text-[11.5px] text-ink-faint">Suggestion</p>
      <p className="mt-1.5 text-[14.5px] leading-snug text-ink">
        Mme Dubois&apos; birthday is June 9. Last year you sent peonies. Prepare the same?
      </p>
      <div className="mt-3 flex items-center gap-3">
        <button className="transition-base inline-flex h-8 items-center gap-1 rounded-lg bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft">
          Prepare <ArrowRightIcon size={11} />
        </button>
        <button className="transition-base text-[12px] text-ink-muted hover:text-ink">
          Other ideas
        </button>
      </div>
    </div>
  );
}

function Houses() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Houses</h2>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-surface-raised">
        {[
          { name: "Le Chalet, Gstaad", note: "Ready", tone: "sage" as const },
          { name: "Hôtel Particulier, Paris", note: "Caretaker only", tone: "neutral" as const },
          { name: "Villa Mariposa, Mustique", note: "Closed for season", tone: "sand" as const },
          { name: "Penthouse 18, New York", note: "Renovations Q3", tone: "champagne" as const },
        ].map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2.5 text-[13.5px] text-ink">
              <Dot tone={r.tone} /> {r.name}
            </span>
            <span className="text-[12px] text-ink-muted">{r.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
