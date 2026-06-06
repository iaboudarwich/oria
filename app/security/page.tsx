import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

export const metadata = {
  title: "Security · Oria",
  description: "How to report security issues in Oria, what's in scope, and what to expect.",
};

// Static-ish content; safe to cache aggressively. Nothing user-
// specific renders here.
export const revalidate = 3600;

/**
 * Public security disclosure page.
 *
 * Linked from /.well-known/security.txt, the dashboard topbar, and
 * the marketing footer. Spells out:
 *   - Where to email
 *   - What we promise (acknowledgement within 72h, status updates)
 *   - What's in scope (the app, the storage bucket, the cron handlers)
 *   - What's out of scope (third-party services we use, social
 *     engineering, physical attacks)
 *   - That there's no bounty program but we appreciate disclosure
 *
 * No form on this page. We deliberately want every report to start as
 * an email so we have an audit trail outside our own logs.
 */
export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link href="/" className="inline-flex">
            <Wordmark />
          </Link>
          <Link href="/login" className="transition-base text-[13px] text-ink-muted hover:text-ink">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight text-ink">Security</h1>
          <p className="mt-3 text-[15px] text-ink-soft">
            Oria is in beta. We treat security reports seriously and reply quickly. This page tells
            you how to report something, what to expect from us, and what&apos;s in scope.
          </p>
        </div>

        <Section title="Why I built Oria">
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised text-[18px] font-semibold text-ink-muted"
            >
              I
            </span>
            <div className="space-y-3">
              <p>
                I built Oria because I was tired of losing track of my own life: subscriptions I
                forgot I had, bills that slipped, documents I could never find when I needed them. I
                wanted one calm place that quietly keeps everything and surfaces what matters,
                without selling me out.
              </p>
              <p>
                I use Oria every day, and I hold your data to the standard I want for my own. It is
                encrypted, isolated per account, read-only where it touches your email, and
                deletable in one click. If something here worries you, write to me directly:{" "}
                <a
                  className="transition-base text-brand underline hover:opacity-80"
                  href="mailto:hi@heyoria.com"
                >
                  hi@heyoria.com
                </a>
                .
              </p>
              <p className="text-[13px] text-ink-faint">Issam, founder of Oria</p>
            </div>
          </div>
        </Section>

        <Section title="How to report">
          <p>
            Email{" "}
            <a
              className="transition-base text-brand underline hover:opacity-80"
              href="mailto:security@heyoria.com"
            >
              security@heyoria.com
            </a>
            . PGP is fine; ask if you want our key.
          </p>
          <p>Include, at minimum:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>A clear description of the issue.</li>
            <li>Steps to reproduce. If your steps involve a test account, tell us which one.</li>
            <li>
              The impact you believe it has. We&apos;ll calibrate; you don&apos;t need to grade it
              for us.
            </li>
            <li>A timeline preference if you have one (e.g. plan to publish in 90 days).</li>
          </ul>
        </Section>

        <Section title="What you can expect from us">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium text-ink">Acknowledgement within 72 hours.</span> A human
              will reply.
            </li>
            <li>An honest assessment of severity and a target fix window.</li>
            <li>
              Credit in the release note if you want it. We will not name you without permission.
            </li>
            <li>No legal action against good-faith research that respects the scope below.</li>
          </ul>
          <p>
            We are a beta product without a bug bounty program. We appreciate responsible disclosure
            and try to make the process feel respectful.
          </p>
        </Section>

        <Section title="In scope">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <code className="rounded bg-canvas px-1.5 py-0.5 text-[12px] text-ink">
                heyoria.com
              </code>{" "}
              and any subdomain we operate.
            </li>
            <li>The Oria mobile/desktop app, when those exist.</li>
            <li>
              The Supabase project we run (vulnerabilities specific to our configuration of it).
            </li>
            <li>The Python extraction sidecar we deploy on Railway.</li>
          </ul>
        </Section>

        <Section title="Out of scope">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Third-party services we use (Supabase platform itself, Anthropic, Resend, Vercel,
              OpenAI). Please report those upstream.
            </li>
            <li>Social-engineering attacks against Oria employees or other users.</li>
            <li>Physical attacks against Oria infrastructure or staff.</li>
            <li>
              Findings that require already-elevated access (e.g. you already have the service-role
              key).
            </li>
            <li>
              Denial-of-service findings whose realistic exploit volume is what every public web
              service already accepts.
            </li>
            <li>
              Self-XSS, missing security headers without a demonstrated attack, and reports that
              copy automated-scanner output without analysis.
            </li>
          </ul>
        </Section>

        <Section title="Safe harbour">
          <p>
            If you act in good faith, stay within the scope above, and don&apos;t exfiltrate or
            destroy other people&apos;s data, we will not pursue legal action and will work with you
            on disclosure.
          </p>
        </Section>

        <p className="text-[12.5px] text-ink-faint">
          Machine-readable contact:{" "}
          <Link
            href="/.well-known/security.txt"
            className="text-brand underline hover:opacity-80"
            prefetch={false}
          >
            /.well-known/security.txt
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[18px] font-semibold tracking-tight text-ink">{title}</h2>
      <div className="space-y-3 text-[14px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}
