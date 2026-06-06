import { DemoTopbar } from "@/components/demo/demo-shell";
import { Badge, Dot } from "@/components/ui/badge";
import { DownloadIcon, FilterIcon } from "@/components/ui/icon";

export const metadata = { title: "Accountant" };

export default function AccountantRolePage() {
  return (
    <>
      <DemoTopbar title="Books" />

      <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button className="transition-base inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-3 text-[12px] text-ink-muted hover:border-line-strong hover:text-ink">
            <FilterIcon size={12} /> May
          </button>
          <button className="transition-base inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft">
            <DownloadIcon size={12} /> Export
          </button>
        </div>
      </div>

      <div className="animate-fade-up space-y-6">
        <Stats />
        <Progress />
        <Categories />
        <Exceptions />
      </div>
    </>
  );
}

function Stats() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { k: "Out", v: "CHF 1.28M" },
        { k: "In", v: "CHF 2.11M" },
        { k: "Reconciled", v: "96.4%" },
        { k: "Exceptions", v: "3" },
      ].map((s) => (
        <div key={s.k} className="rounded-xl border border-line bg-surface-raised p-4">
          <p className="text-[11.5px] text-ink-faint">{s.k}</p>
          <p className="mt-1.5 text-[20px] font-semibold text-ink">{s.v}</p>
        </div>
      ))}
    </div>
  );
}

function Progress() {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12.5px] text-ink-muted">Reconciliation, May</p>
        <span className="text-[12px] text-ink-muted">96.4%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full w-[96.4%] rounded-full bg-accent" />
      </div>
    </div>
  );
}

function Categories() {
  const rows = [
    { cat: "Properties", v: "CHF 412k", pct: 32, trend: "−2.1%" },
    { cat: "Staff", v: "CHF 318k", pct: 25, trend: "+0.4%" },
    { cat: "Travel", v: "CHF 287k", pct: 22, trend: "−9.0%" },
    { cat: "Hospitality", v: "CHF 142k", pct: 11, trend: "+18%" },
    { cat: "Personal", v: "CHF 78k", pct: 6, trend: "−4%" },
    { cat: "Other", v: "CHF 46k", pct: 4, trend: "" },
  ];
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">By category</h2>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-ink-faint">
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-3 py-2.5 font-medium">Amount</th>
              <th className="px-3 py-2.5 font-medium">Share</th>
              <th className="px-4 py-2.5 text-right font-medium">YoY</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cat} className="transition-base border-t border-line hover:bg-canvas/60">
                <td className="px-4 py-2.5 text-ink">{r.cat}</td>
                <td className="px-3 py-2.5 text-ink">{r.v}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${r.pct}%` }}
                      />
                    </div>
                    <span className="text-[11.5px] text-ink-muted">{r.pct}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right text-[12px] text-ink-muted">{r.trend}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Exceptions() {
  const rows = [
    {
      d: "17 May",
      who: "Unknown, Nice",
      desc: "EUR 8,210 swipe",
      tone: "claret" as const,
      status: "Awaiting",
    },
    {
      d: "12 May",
      who: "Pictet & Cie",
      desc: "FX rounding",
      tone: "champagne" as const,
      status: "Auto",
    },
    {
      d: "09 May",
      who: "Vertumne",
      desc: "Possible duplicate",
      tone: "champagne" as const,
      status: "Contacted",
    },
    {
      d: "04 May",
      who: "Capt. Mendez",
      desc: "Overtime coding",
      tone: "neutral" as const,
      status: "Coded",
    },
    {
      d: "02 May",
      who: "Pacific Coast",
      desc: "Receipt missing",
      tone: "neutral" as const,
      status: "Requested",
    },
  ];
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Exceptions</h2>
        <Badge tone="champagne">3 priority</Badge>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface-raised">
        <table className="w-full min-w-[600px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-ink-faint">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Counterparty</th>
              <th className="px-3 py-2.5 font-medium">Description</th>
              <th className="px-4 py-2.5 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="transition-base border-t border-line hover:bg-canvas/60">
                <td className="px-4 py-2.5 text-[12px] text-ink-muted">{r.d}</td>
                <td className="px-3 py-2.5 text-ink">{r.who}</td>
                <td className="px-3 py-2.5 text-[12.5px] text-ink-muted">{r.desc}</td>
                <td className="px-4 py-2.5 text-right">
                  <Badge tone={r.tone}>
                    <Dot tone={r.tone} /> {r.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
