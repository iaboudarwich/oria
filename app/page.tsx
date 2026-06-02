import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import {
  ArrowRightIcon,
  CalendarIcon,
  ChatIcon,
  DocumentIcon,
  MicIcon,
  PaperclipIcon,
  PlaneIcon,
  UploadIcon,
} from "@/components/ui/icon";

// Demo personas + fixture data should not appear on the public site by
// default. only when explicitly enabled via NEXT_PUBLIC_DEMO_MODE=1.
const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteHeader />
      <main>
        <Hero />
        <UploadShowcase />
        <FeatureGrid />
        <ForEveryone />
        <TrustSection />
        <CTA />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
        <Wordmark />
        <nav className="hidden items-center gap-7 md:flex">
          <Link href="#features" className="text-[13.5px] text-ink-muted hover:text-ink transition-base">
            Features
          </Link>
          <Link href="#for-everyone" className="text-[13.5px] text-ink-muted hover:text-ink transition-base">
            Who it&apos;s for
          </Link>
          {DEMO_ENABLED ? (
            <Link href="/demo" className="text-[13.5px] text-ink-muted hover:text-ink transition-base">
              Demo
            </Link>
          ) : null}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden sm:inline text-[13.5px] text-ink-muted hover:text-ink transition-base"
          >
            Sign in
          </Link>
          <Button href="/signup" variant="primary" size="sm">
            Get started
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-3xl px-6 pt-20 pb-20 text-center sm:px-8">
        <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight text-ink text-balance sm:text-[56px]">
          Drop anything into Oria.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[16px] leading-[1.55] text-ink-muted">
          A searchable memory for your life. Nothing gets lost.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href="/signup" variant="primary" size="lg">
            Get started, free
          </Button>
          {DEMO_ENABLED ? (
            <Button href="/demo" variant="ghost" size="lg">
              Explore demo
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function UploadShowcase() {
  const fileTypes = [
    { Icon: DocumentIcon, label: "PDFs" },
    { Icon: PaperclipIcon, label: "Receipts" },
    { Icon: ChatIcon, label: "WhatsApps" },
    { Icon: MicIcon, label: "Voice notes" },
    { Icon: PlaneIcon, label: "Itineraries" },
    { Icon: CalendarIcon, label: "Schedules" },
  ];
  return (
    <section className="border-b border-line bg-surface/50">
      <div className="mx-auto max-w-4xl px-6 py-16 sm:px-8">
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface-raised/70 p-10 sm:p-14 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-canvas text-ink-muted">
            <UploadIcon size={18} />
          </span>
          <h2 className="mt-5 text-[22px] font-semibold tracking-tight text-ink sm:text-[26px]">
            Drag, drop, done.
          </h2>
          <p className="mt-2 text-[14px] text-ink-muted">
            Read, filed, and kept searchable. Find it years later.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {fileTypes.map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas/60 px-2.5 py-1 text-[12px] text-ink-muted"
              >
                <f.Icon size={12} /> {f.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  const features = [
    { title: "Upload anything", body: "PDFs, receipts, screenshots, voice notes. Nothing gets lost." },
    { title: "Find anything", body: "Search past trips, receipts, contractors, and uploads." },
    { title: "Auto sections", body: "Household, Travel, Finance, Legal. Sorted for you." },
    { title: "Reminders", body: "Dates and follow-ups surfaced when they matter." },
    { title: "Share with people", body: "Family, assistants, contractors. Scoped views." },
    { title: "Long-term memory", body: "A full record of every upload and decision, kept for the long run." },
  ];
  return (
    <section id="features" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:px-8">
        <h2 className="text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">
          A calm place to keep everything, and find it later.
        </h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article key={f.title} className="bg-surface-raised p-6">
              <h3 className="text-[15px] font-semibold text-ink">{f.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-[1.55] text-ink-muted">
                {f.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ForEveryone() {
  const groups = [
    { label: "Individuals", body: "Keep your life in one place." },
    { label: "Couples", body: "Shared reminders, shared notes." },
    { label: "Families", body: "School, medical, travel, in sync." },
    { label: "Assistants", body: "Coordinate across everyone you support." },
    { label: "Property managers", body: "Track properties, vendors, contracts." },
    { label: "Family offices", body: "Memory across households and advisors." },
  ];
  return (
    <section id="for-everyone" className="border-b border-line bg-surface/50">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:px-8">
        <h2 className="text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">
          Works for one person or a whole office.
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div
              key={g.label}
              className="rounded-xl border border-line bg-surface-raised p-5"
            >
              <p className="text-[14px] font-semibold text-ink">{g.label}</p>
              <p className="mt-1 text-[13px] leading-[1.55] text-ink-muted">
                {g.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  const badges = [
    "AES-256-GCM encryption",
    "Read-only Gmail access",
    "Row-level data isolation",
    "One-click full delete",
  ];
  return (
    <section className="border-b border-line bg-surface/50">
      <div className="mx-auto max-w-3xl px-6 py-20 sm:px-8">
        <h2 className="text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">
          Built with privacy in mind.
        </h2>
        <p className="mt-4 text-[15px] leading-[1.6] text-ink-muted">
          Oria reads your email and documents to find what matters: subscriptions,
          bills, flights, appointments. Everything is encrypted at rest and in
          transit. We never send, delete, or modify your email. We do not sell your
          data, ever. Disconnect any time and your data is gone within seconds.
          Built by one person who uses Oria every day.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {badges.map((b) => (
            <span
              key={b}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-[13px] text-ink"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-sage" aria-hidden />
              {b}
            </span>
          ))}
        </div>
        <Link
          href="/security"
          prefetch={false}
          className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-brand hover:opacity-80 transition-base"
        >
          Read our security and privacy approach <ArrowRightIcon size={13} />
        </Link>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center sm:px-8">
        <h2 className="text-[28px] font-semibold tracking-tight text-ink text-balance sm:text-[34px]">
          Upload anything. Find it years later.
        </h2>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button href="/signup" variant="primary" size="lg">
            Get started <ArrowRightIcon size={14} />
          </Button>
          {DEMO_ENABLED ? (
            <Button href="/demo" variant="secondary" size="lg">
              Explore demo
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-[12.5px] text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Wordmark />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/privacy" className="hover:text-ink transition-base">Privacy</Link>
          <Link href="/security" className="hover:text-ink transition-base" prefetch={false}>Security</Link>
          <Link href="/terms" className="hover:text-ink transition-base">Terms</Link>
          <Link href="mailto:hi@heyoria.com" className="hover:text-ink transition-base">Contact</Link>
        </div>
        <p className="text-ink-faint">© {new Date().getFullYear()} Oria</p>
      </div>
    </footer>
  );
}
