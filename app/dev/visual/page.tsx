import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ScoreRing } from "@/components/ui/score-ring";
import { TrendChart } from "@/components/ui/trend-chart";
import { InsightCard } from "@/components/ui/insight-card";
import { CardStack, CardStackItem } from "@/components/ui/card-stack";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid, Inset } from "@/components/ui/layout";
import { DATA_VAR, DATA_TRACK } from "@/lib/ui/status-color";
import { ACCENT_PRESETS } from "@/lib/appearance/accent";

/**
 * Dev-only DESIGN-SYSTEM GALLERY (Round: design infra). Renders the key
 * primitives in fixed states, in BOTH themes side by side, at the default mint
 * accent, with NO user data, so the output is deterministic. It is the human
 * review surface for "all states, both themes" (the Storybook intent) AND the
 * stable target for the visual-regression screenshots (scripts/verify-visual.mjs).
 *
 * Hard-gated: 404s in a production build, like /dev/icons, so it never ships.
 * Each theme column sets `.dark` / `.light` locally so the token cascade
 * resolves per column regardless of the user's active theme.
 */
export const metadata = { title: "Visual gallery (dev)" };

const WEEK = [
  { label: "Sa", value: 62 },
  { label: "Su", value: 74 },
  { label: "Mo", value: 58 },
  { label: "Tu", value: 81 },
  { label: "We", value: 69 },
  { label: "Th", value: 88 },
  { label: "Fr", value: 72 },
];
const MONTH = WEEK.concat(WEEK).concat(WEEK).slice(0, 18);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <p className="text-eyebrow">{title}</p>
      {children}
    </Stack>
  );
}

function Showcase() {
  return (
    <Inset pad={5}>
      <Stack gap={6}>
        <Section title="Dials — semantic data colors">
          <Cluster gap={4}>
            <ScoreRing
              score={82}
              size={92}
              colorVar={DATA_VAR.recovery}
              trackVar={DATA_TRACK.recovery}
              caption="Recovery"
            />
            <ScoreRing
              score={91}
              size={92}
              colorVar={DATA_VAR.sleep}
              trackVar={DATA_TRACK.sleep}
              caption="Sleep"
            />
            <ScoreRing
              score={68}
              size={92}
              colorVar={DATA_VAR.strain}
              trackVar={DATA_TRACK.strain}
              center={<span className="num text-[20px] font-semibold text-ink">14.2</span>}
              caption="Strain"
            />
            <ScoreRing
              score={62}
              size={92}
              colorVar={DATA_VAR.spend}
              trackVar={DATA_TRACK.spend}
              center={<span className="num text-[16px] font-semibold text-ink">62%</span>}
              caption="Spend"
            />
          </Cluster>
        </Section>

        <Section title="Dials — auto status tone (low / mid / high)">
          <Cluster gap={4}>
            <ScoreRing score={22} size={72} caption="Needs attention" />
            <ScoreRing score={50} size={72} caption="Soon" />
            <ScoreRing score={84} size={72} caption="On track" />
          </Cluster>
        </Section>

        <Section title="TrendChart — 1 week / 1 month">
          <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
            <TrendChart
              week={WEEK}
              month={MONTH}
              kind="bar"
              weekLabel="1 week"
              monthLabel="1 month"
              caption="Recovery trend"
            />
          </div>
        </Section>

        <Section title="InsightCard">
          <InsightCard
            insight="Recovery is high and spending is under last month, so it is a light day."
            evidence={<span className="num text-[22px] font-semibold text-ink">82%</span>}
            detail={<p className="text-[13px] text-ink-muted">Resting HR 52 bpm, HRV 78 ms.</p>}
            detailLabel="What shaped it"
          />
        </Section>

        <Section title="CardStack">
          <CardStack ariaLabel="Holdings">
            <CardStackItem>
              <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
                <p className="text-[12px] text-ink-muted">Cash</p>
                <p className="num text-[19px] font-semibold text-ink">$24,500</p>
              </div>
            </CardStackItem>
            <CardStackItem>
              <div className="rounded-card border border-line bg-surface p-4 shadow-soft">
                <p className="text-[12px] text-ink-muted">Crypto</p>
                <p className="num text-[19px] font-semibold text-ink">$8,140</p>
              </div>
            </CardStackItem>
          </CardStack>
        </Section>

        <Section title="Buttons">
          <Cluster gap={2}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="primary" size="sm">
              Small
            </Button>
          </Cluster>
        </Section>

        <Section title="Accent presets (this theme)">
          <Cluster gap={2}>
            {ACCENT_PRESETS.map((p) => (
              <span
                key={p.key}
                className="h-9 w-9 rounded-full border border-line"
                style={{ background: p.dark.accent }}
                title={p.key}
              />
            ))}
          </Cluster>
        </Section>

        <Section title="Data colors (fixed)">
          <Cluster gap={2}>
            {(["--rec", "--sleep", "--strain", "--spend", "--up", "--down"] as const).map((v) => (
              <span
                key={v}
                className="h-9 w-9 rounded-lg border border-line"
                style={{ background: `var(${v})` }}
                title={v}
              />
            ))}
          </Cluster>
        </Section>

        <Section title="Layout primitives">
          <Grid gap={3} cols={3}>
            <Inset
              pad={3}
              className="rounded-tile bg-surface-2 text-center text-[12px] text-ink-muted"
            >
              Inset
            </Inset>
            <Inset
              pad={3}
              className="rounded-tile bg-surface-2 text-center text-[12px] text-ink-muted"
            >
              Grid
            </Inset>
            <Inset
              pad={3}
              className="rounded-tile bg-surface-2 text-center text-[12px] text-ink-muted"
            >
              Stack
            </Inset>
          </Grid>
        </Section>
      </Stack>
    </Inset>
  );
}

export default function VisualGalleryPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      <div className="dark" style={{ background: "var(--canvas)" }}>
        <Inset y={3} x={4} className="text-ink">
          <p className="text-eyebrow mb-2">Dark</p>
        </Inset>
        <Showcase />
      </div>
      <div className="light" style={{ background: "var(--canvas)" }}>
        <Inset y={3} x={4} className="text-ink">
          <p className="text-eyebrow mb-2">Light</p>
        </Inset>
        <Showcase />
      </div>
    </div>
  );
}
