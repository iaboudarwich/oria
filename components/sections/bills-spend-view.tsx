import { ReportChartView } from "@/components/work/report-chart";
import type { ReportChart } from "@/lib/data/workspace-reports";
import type { BillItem } from "@/lib/data/smart-sections";

function money(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value)}`;
  }
}

/**
 * Bills "Spend" view: monthly spend over the last 12 months as a bar chart,
 * plus a per-category breakdown table. Server-rendered from the bills already
 * fetched by the page; uses the existing inline-SVG chart so no charting
 * library ships to the client.
 */
export function BillsSpendView({ bills }: { bills: BillItem[] }) {
  const now = new Date();
  const months: Array<{ key: string; label: string }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString(undefined, { month: "short" }),
    });
  }
  const monthKeys = new Set(months.map((m) => m.key));

  const monthTotals = new Map<string, number>();
  const catTotals = new Map<string, number>();
  let currency = "USD";
  for (const b of bills) {
    if (!b.occurred_at || typeof b.amount_normalized !== "number") continue;
    const d = new Date(b.occurred_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (monthKeys.has(key)) {
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + b.amount_normalized);
    }
    const cat = b.category || "Other";
    catTotals.set(cat, (catTotals.get(cat) ?? 0) + b.amount_normalized);
    if (b.amount_currency) currency = b.amount_currency;
  }

  const barChart: ReportChart = {
    kind: "bar",
    caption: "Monthly spend, last 12 months",
    series: [
      {
        label: "Spend",
        data: months.map((m) => ({
          x: m.label,
          y: Math.round(monthTotals.get(m.key) ?? 0),
        })),
      },
    ],
  };

  const catRows = [...catTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => [cat, money(total, currency)]);
  const tableChart: ReportChart = {
    kind: "table",
    caption: "By category",
    table: { columns: ["Category", "Total"], rows: catRows },
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 px-1 text-eyebrow">Monthly spend</h2>
        <div className="rounded-2xl border border-line bg-surface-raised p-4">
          <ReportChartView chart={barChart} />
        </div>
      </section>
      {catRows.length > 0 ? (
        <section>
          <h2 className="mb-2 px-1 text-eyebrow">By category</h2>
          <div className="rounded-2xl border border-line bg-surface-raised p-4">
            <ReportChartView chart={tableChart} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
