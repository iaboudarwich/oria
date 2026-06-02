import type { Metadata } from "next";

// Server rendered, cached for a day. Nothing user-specific renders here.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Privacy Policy · Oria",
  description: "How Oria collects, processes, stores, and protects your data.",
};

const LAST_UPDATED = "June 1, 2026";

type Section = { heading: string; paragraphs?: string[]; bullets?: string[] };

const SECTIONS: Section[] = [
  {
    heading: "What we collect",
    paragraphs: [
      "We collect only what we need to run Oria for you:",
    ],
    bullets: [
      "Your email and password, handled by our authentication provider (Supabase Auth).",
      "Files you upload. These are stored encrypted at rest in Supabase Storage, in a United States region.",
      "Text extracted from your files, stored in our Postgres database so it can be searched and organized.",
      "Embeddings, which are numeric vector representations of your text used to power semantic search.",
      "Reminders, sections, and entities you create.",
      "An audit log of your sign-ins and sensitive account actions, which you can view and export in Settings.",
    ],
  },
  {
    heading: "Gmail access",
    paragraphs: [
      "When you connect Gmail, Oria requests read-only access to your inbox (gmail.readonly). We use this to scan for receipts, subscriptions, bills, flights, and bookings so you can track recurring expenses automatically.",
    ],
    bullets: [
      "We never send, delete, modify, or forward your email.",
      "We never sell or share your email data with third parties.",
      "We store encrypted OAuth tokens required to maintain your connection.",
      "We store structured data extracted from emails (e.g. merchant name, amount, date). We do not store raw email bodies.",
      "You can set keywords that cause matching emails to be skipped entirely during scanning.",
    ],
  },
  {
    heading: "Disconnecting Gmail",
    paragraphs: [
      "You can disconnect Gmail at any time from Settings. Disconnecting revokes our access at Google and permanently deletes your tokens from our system. You can also request deletion of all extracted data by emailing support@heyoria.com.",
    ],
  },
  {
    heading: "How we process it",
    paragraphs: [
      "To understand your files, Oria sends their contents to a small set of AI providers:",
    ],
    bullets: [
      "Files are sent to Anthropic (the Claude API) for text understanding, classification, and extraction.",
      "Voice recordings are sent to OpenAI (the Whisper API) for transcription only.",
      "Neither Anthropic nor OpenAI trains on our API traffic by default, and both process data under their respective data processing agreements.",
    ],
  },
  {
    heading: "Where it lives",
    paragraphs: [
      "Your data is stored in United States regions across our infrastructure providers: Supabase Postgres for structured data, Supabase Storage for files, and Upstash Redis for ephemeral state. Backups are handled by Supabase.",
    ],
  },
  {
    heading: "Who can access it",
    paragraphs: ["The following parties can access your data, and no one else:"],
    bullets: [
      "You.",
      "Members you invite, limited to the access level you grant them.",
      "Oria operators (the founder), for support and abuse investigation.",
      "Our subprocessors, strictly to provide their service: Supabase, Anthropic, OpenAI, Vercel, Railway, Resend, Sentry, Upstash, and Cloudflare.",
    ],
  },
  {
    heading: "Retention",
    paragraphs: [
      "We keep your data until you delete it. Account deletion is permanent and immediate. We hold backups for 7 days after deletion, after which they are pruned by Supabase.",
    ],
  },
  {
    heading: "Your rights",
    paragraphs: [
      "You can export all of your data at any time from Settings, and you can delete your account at any time. To request a complete deletion confirmation, email privacy@heyoria.com.",
    ],
  },
  {
    heading: "Cookies and tracking",
    paragraphs: [
      "We use essential cookies for authentication only. We do not use advertising trackers. For details on analytics, see our Terms of Service.",
    ],
  },
  {
    heading: "Children",
    paragraphs: ["Oria is not intended for users under 16 years of age."],
  },
  {
    heading: "Changes",
    paragraphs: [
      "We will notify you by email before any material change to this policy takes effect.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [
      "Questions about your privacy? Email us at privacy@heyoria.com.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <article className="prose prose-sm max-w-none text-ink-soft prose-headings:text-ink prose-headings:font-semibold prose-strong:text-ink prose-a:text-brand">
      <p className="text-eyebrow">Privacy Policy</p>
      <h1 className="text-display">Privacy Policy</h1>
      <p className="text-body-sm text-ink-faint">Last updated: {LAST_UPDATED}</p>

      {SECTIONS.map((s) => (
        <section key={s.heading}>
          <h2 className="text-title">{s.heading}</h2>
          {s.paragraphs?.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {s.bullets ? (
            <ul>
              {s.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </article>
  );
}
