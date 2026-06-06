import { Topbar } from "@/components/dashboard/topbar";
import {
  BoxIcon,
  HomeIcon,
  LockIcon,
  PulseIcon,
  SearchIcon,
  SparkIcon,
  StaffIcon,
} from "@/components/ui/icon";

export const metadata = { title: "Private Oria" };

const PILLARS: {
  Icon: React.ComponentType<{ size?: number }>;
  title: string;
  body: string;
}[] = [
  {
    Icon: SparkIcon,
    title: "Local AI",
    body: "Document understanding running on your own machine. Models stay offline.",
  },
  {
    Icon: HomeIcon,
    title: "Internal Memory",
    body: "A private knowledge layer for your home, your office, or a small team.",
  },
  {
    Icon: LockIcon,
    title: "Secure Vault",
    body: "End-to-end encrypted folder for the most sensitive uploads.",
  },
  {
    Icon: SearchIcon,
    title: "Internal Search",
    body: "Search company knowledge without anything leaving your network.",
  },
  {
    Icon: StaffIcon,
    title: "Team Knowledge",
    body: "Operational memory shared with a small set of trusted people.",
  },
  {
    Icon: BoxIcon,
    title: "Device Sync",
    body: "Mac, iPhone, iPad. The same memory, kept on your devices.",
  },
];

export default function PrivateOriaPage() {
  return (
    <>
      <Topbar title="Private Oria" />

      <div className="animate-fade-up space-y-10">
        <section className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-raised px-2 py-0.5 text-[11px] text-ink-muted">
            <PulseIcon size={11} /> Preview
          </span>
          <h2 className="mt-3 text-[22px] font-semibold tracking-tight text-ink sm:text-[26px]">
            A self-hosted, local-first version of Oria for confidential memory.
          </h2>
          <p className="mt-3 text-[14px] leading-[1.55] text-ink-muted">
            Private Oria runs entirely on your own infrastructure. Same upload anything, same calm
            search, same operational memory, but the files, the AI, and the index live on hardware
            you control.
          </p>
          <p className="mt-2 text-[13px] text-ink-faint">
            Not built yet. This is the architecture and the direction.
          </p>
        </section>

        <section>
          <h3 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">What it covers</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <article
                key={p.title}
                className="rounded-xl border border-line bg-surface-raised p-5"
              >
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-canvas text-ink-muted">
                  <p.Icon size={14} />
                </div>
                <p className="text-[14px] font-semibold text-ink">{p.title}</p>
                <p className="mt-1 text-[13px] leading-[1.55] text-ink-muted">{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="max-w-2xl rounded-xl border border-line bg-surface-raised p-6">
          <h3 className="text-[14px] font-semibold text-ink">Bring it to your team</h3>
          <p className="mt-1 text-[13px] text-ink-muted">
            Private Oria opens to a small set of households and offices first. Send a note if you
            want to be on that list.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <a
              href="mailto:private@oria.app?subject=Private%20Oria"
              className="transition-base inline-flex h-10 items-center rounded-lg bg-ink px-4 text-[13px] text-surface hover:bg-ink-soft"
            >
              Request access
            </a>
            <p className="text-[12px] text-ink-faint">private@oria.app</p>
          </div>
        </section>

        <section className="max-w-2xl">
          <h3 className="mb-2 px-1 text-[13px] font-medium text-ink-muted">How it will feel</h3>
          <ul className="space-y-1.5">
            {[
              "Same minimal interface you already use",
              "Search runs locally, never leaves your device",
              "Hosted on a Mac mini, a NAS, or your own server",
              "Sync between devices, no public cloud needed",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5 px-1 text-[13px] text-ink-soft">
                <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
