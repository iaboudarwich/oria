import type { Metadata } from "next";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Terms of Service · Oria",
  description: "The terms that govern your use of Oria.",
};

const LAST_UPDATED = "June 1, 2026";

type Section = { heading: string; paragraphs?: string[]; bullets?: string[] };

const SECTIONS: Section[] = [
  {
    heading: "Acceptance",
    paragraphs: [
      "By creating an account or using Oria, you agree to these terms. If you do not agree, please do not use the service.",
    ],
  },
  {
    heading: "Beta software",
    paragraphs: [
      "Oria is in beta. Bugs, downtime, and data issues are possible. The service is provided as is, without warranty of any kind. Please do not rely on Oria as the sole store of anything you cannot afford to lose.",
    ],
  },
  {
    heading: "Account responsibilities",
    paragraphs: [
      "You are responsible for keeping your password and two-factor codes safe, and for all content you upload. You agree not to upload content you do not have the right to store.",
    ],
  },
  {
    heading: "Acceptable use",
    paragraphs: ["You agree not to use Oria for any of the following:"],
    bullets: [
      "Illegal content or activity.",
      "Impersonating another person or entity.",
      "Harassment of others.",
      "Attempts to compromise the service or other users.",
    ],
  },
  {
    heading: "Termination",
    paragraphs: [
      "You can delete your account at any time. We may suspend or terminate accounts that violate these terms.",
    ],
  },
  {
    heading: "Limitation of liability",
    paragraphs: [
      "To the maximum extent permitted by law, Oria and its operators are not liable for any indirect, incidental, or consequential damages, or for any loss of data, arising from your use of this beta software. Our total liability is limited to the amount you paid us, if any, in the 12 months before the claim.",
    ],
  },
  {
    heading: "Governing law",
    paragraphs: [
      "These terms are governed by the laws of the State of Delaware, United States, without regard to its conflict of laws rules.",
    ],
  },
  {
    heading: "Analytics",
    paragraphs: [
      "We use privacy-respecting product analytics to understand how Oria is used in aggregate. We do not sell your data and we do not use advertising trackers.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [
      "Questions about these terms? Email us at legal@heyoria.com.",
    ],
  },
];

export default function TermsPage() {
  return (
    <article className="prose prose-sm max-w-none text-ink-soft prose-headings:text-ink prose-headings:font-semibold prose-strong:text-ink prose-a:text-brand">
      <p className="text-eyebrow">Terms of Service</p>
      <h1 className="text-display">Terms of Service</h1>
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
