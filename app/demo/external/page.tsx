import { DemoTopbar } from "@/components/demo/demo-shell";
import { Badge, Dot } from "@/components/ui/badge";
import {
  CheckIcon,
  ClockIcon,
  DocumentIcon,
  LockIcon,
  PaperclipIcon,
  PersonIcon,
} from "@/components/ui/icon";

export const metadata = { title: "External" };

export default function ExternalRolePage() {
  return (
    <>
      <DemoTopbar title="Scoped to you" />

      <div className="mb-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Badge tone="champagne">
          <LockIcon size={11} /> Maison Vertumne
        </Badge>
      </div>

      <div className="space-y-6 animate-fade-up">
        <Notice />

        <div className="grid gap-5 lg:grid-cols-3">
          <Items />
          <Upload />
        </div>

        <History />
      </div>
    </>
  );
}

function Notice() {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
          <LockIcon size={13} />
        </span>
        <p className="text-[13.5px] text-ink leading-snug">
          You can see 3 items, all about the Paris dinner on 17 June. Nothing else.
        </p>
      </div>
    </div>
  );
}

function Items() {
  const items = [
    { title: "Confirm peonies and ranunculus", meta: "17 June, 12 guests", state: "Reply", tone: "champagne" as const },
    { title: "Brief, table plan and palette", meta: "Sofia, 2 days ago", state: "Reviewed", tone: "sage" as const },
    { title: "Delivery instructions", meta: "Hôtel Particulier, 16:00", state: "Confirmed", tone: "sage" as const },
  ];
  return (
    <section className="lg:col-span-2">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Paris dinner</h2>
        <Badge tone="neutral">3</Badge>
      </div>
      <div className="rounded-xl border border-line bg-surface-raised">
        <ul className="divide-y divide-line">
          {items.map((it) => (
            <li
              key={it.title}
              className="flex items-start gap-3 px-4 py-3 transition-base hover:bg-canvas/60"
            >
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-ink-muted">
                <DocumentIcon size={12} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] text-ink">{it.title}</p>
                <p className="text-[11.5px] text-ink-muted">{it.meta}</p>
              </div>
              <Badge tone={it.tone}>
                <Dot tone={it.tone} /> {it.state}
              </Badge>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-faint">
            <PersonIcon size={12} /> Sofia, your contact
          </span>
          <button className="inline-flex h-8 items-center gap-1 rounded-lg bg-ink px-3 text-[12px] text-surface hover:bg-ink-soft transition-base">
            <CheckIcon size={11} /> Confirm
          </button>
        </div>
      </div>
    </section>
  );
}

function Upload() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">Reply</h2>
      </div>
      <div className="rounded-xl border border-line bg-surface-raised p-5">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-canvas/50 px-4 py-6 text-[13px] text-ink-muted transition-base hover:border-ink-muted hover:text-ink"
        >
          <PaperclipIcon size={15} />
          Drop a file
        </button>
        <button className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-ink text-[13px] text-surface hover:bg-ink-soft transition-base">
          Send
        </button>
      </div>
    </section>
  );
}

function History() {
  const items = [
    { when: "Yesterday", who: "Sofia", what: "Sent the brief" },
    { when: "Yesterday", who: "You", what: "Acknowledged" },
    { when: "2 days ago", who: "Sofia", what: "Confirmed palette" },
    { when: "3 days ago", who: "Oria", what: "Created this workspace" },
  ];
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-[14px] font-semibold text-ink">History</h2>
      </div>
      <ul className="rounded-xl border border-line bg-surface-raised divide-y divide-line">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-20 shrink-0 text-[11px] text-ink-faint">{it.when}</span>
            <span className="text-[13px] text-ink">{it.who}</span>
            <span className="flex-1 text-[12.5px] text-ink-muted">{it.what}</span>
            <ClockIcon size={11} />
          </li>
        ))}
      </ul>
    </section>
  );
}
