# Oria Trust Messaging

The canonical source for every piece of trust copy in the product. Read this before editing any privacy, onboarding, settings, or marketing string related to data, security, or AI. Translations live in messages/{en,ar,fr,es}.json (one file per locale, namespaced; e.g. the privacy and trust namespaces) and must preserve meaning, not literal phrasing.

---

## 0. The trust contract

We tell the user the truth, in plain language, before we ask for anything.

Every Connect prompt is preceded by a privacy step. Every write action is confirmed. Every memory is visible. Every action is logged. Every export is one click. Every deletion is honored within 30 days, no questions, no retention bargaining.

If we ever can't honor a piece of this contract, we change the contract before we change the product.

---

## 1. Homepage honest-limit line

Lives on heyoria.com, above the fold, below the hero. Never removed without re-review.

**English:**
> Oria reads what you connect. Nothing more. You stay in control of what comes in and what stays out.

**Rules:**
- Must mention the limit ("nothing more" or equivalent).
- Must mention user control.
- Must avoid "AI" jargon, "powered by," "magic," "intelligence."
- Never replaced with marketing copy.

---

## 2. Onboarding privacy slide

Appears **before** the first Connect prompt. Two-column layout. Plain English. Four languages.

### Header
> Before we connect anything, here's what to expect.

### Left column: WHAT ORIA DOES
- Reads the accounts you connect, to find what matters.
- Stores extracted data (bills, dates, contacts, files) encrypted at rest.
- Uses AI to find patterns, draft replies, and surface what's coming.
- Logs every action it takes. You can see the log.
- Lets you disconnect or delete, anytime, no questions.

### Right column: WHAT ORIA NEVER DOES
- Sell your data. Not now, not ever.
- Train AI models on your content.
- Read messages from senders you mark confidential.
- Send, delete, or modify anything without asking first.
- Share anything with advertisers.

### Footer
> Read the full details at heyoria.com/trust. You can change your mind anytime in Settings.

[Continue] (primary button, ink-filled)
[Maybe later] (secondary, ghost)

### Rules
- The left column is always 5 items. The right column is always 5 items.
- Each line is a single sentence under 14 words.
- The Continue button only appears after the user has been on the slide for 2 seconds (no accidental skips).
- "Maybe later" returns to home; doesn't proceed to Connect.

---

## 3. /trust page, full copy

URL: https://heyoria.com/trust. Public, no auth required. Four languages.

### Title
> How we handle your stuff

### Lead
> You're trusting Oria with the shape of your life. We owe you a straight answer about what we do with it.

### Section: What we collect

We collect three kinds of data.

**Accounts you connect.** When you connect Gmail, Calendar, Drive, your bank, or anything else, Oria reads what's there. We extract structured data: who you talked to, when, about what, and what action was implied. We don't store raw email bodies. We don't store raw file contents unless you ask Oria to remember a specific document.

**Things you tell Oria directly.** Conversations with Ask Oria. Notes. Trackables you add manually. Memory entries you write.

**Operational data.** Logs (who used what, when), errors (with personal info scrubbed), and aggregate counts (how many bills, how many connectors). We use this to keep Oria running and to fix bugs.

### Section: Where it lives

- **Database:** Supabase, hosted in the US (or EU if your account is registered in a European country).
- **Files:** Cloudflare R2, encrypted at rest.
- **Cache:** Upstash Redis, US.
- **AI processing:** routed to Anthropic (default), or to your own provider if you've connected one. No model is trained on your data, regardless of provider.
- **Backups:** Daily, encrypted, 30-day retention.

### Section: Who can see it

You. The Oria engineers who maintain the database, only when investigating a bug or security incident, and only with audit logging. No one else.

We don't share, sell, or rent your data to third parties for any purpose. Not for advertising. Not for partnerships. Not for "improving the AI." Not for anything.

### Section: What we never do

- Train AI models on your content.
- Read messages from senders you've marked confidential.
- Send, archive, delete, label, or modify anything in your accounts without confirming with you.
- Show your data to advertisers.
- Sell your data, ever.
- Use your data to improve our marketing or sales targeting.

### Section: Your rights

You can, at any time:
- See every action Oria has taken, in the audit log.
- See every piece of data Oria has remembered, on the "What Oria Knows About You" page.
- Export everything as Markdown and JSON.
- Disconnect any account. We stop reading immediately.
- Delete your account. Your data is soft-deleted for 30 days (in case you change your mind), then hard-deleted from databases and backups.
- Mark senders, topics, or keywords as confidential. Oria will skip anything matching during scans.
- Pause Oria entirely. Everything is preserved but no new scanning happens until you resume.

### Section: AI providers and your data

By default, AI conversations go through Anthropic's Claude. Anthropic does not train on data sent via API. We send only what's needed to answer your question, and we don't include unrelated personal data.

If you connect your own AI provider (BYO Anthropic/OpenAI/Gemini), conversations go through your account instead, and the provider's memory system stores context per their own policies. You control that relationship directly.

### Section: Security

- All data encrypted at rest (AES-256) and in transit (TLS 1.3).
- OAuth tokens encrypted with envelope encryption, keys held separately.
- Two-factor authentication available, and required for accounts with write-back enabled.
- We run automated security scans daily. Sentry monitors for anomalies. We patch promptly.

We're working toward SOC 2 Type II (Round 37 on our roadmap). When we have it, this section will say so with a link to the report.

### Section: When something goes wrong

If we have a data incident, you'll hear from us within 72 hours, by email and in-app. We'll tell you what happened, what data was affected, and what we're doing. No spin.

### Section: Changes to this page

We don't change this page silently. If our practices change, we notify every user in-app 30 days before the change takes effect, and you can object or delete your account before then.

### Section: Contact

Privacy questions, deletion requests, or security disclosures:
- Email: privacy@heyoria.com
- Security disclosures: security@heyoria.com

Subprocessors: see the full list at heyoria.com/trust/subprocessors.

Last updated: [auto-generated date]

---

## 4. /trust/subprocessors, table

URL: https://heyoria.com/trust/subprocessors. Public, four languages.

### Header
> Every third party that touches your data.

### Table

| Subprocessor | Purpose | Data accessed | Location |
|---|---|---|---|
| Supabase | Database hosting | All structured user data | US (or EU if your account is EU-registered) |
| Vercel | Web hosting | Request logs, user sessions | US |
| Railway | Python sidecar (embeddings, extraction) | Document text in transit, never stored | US |
| Anthropic | Default AI provider for conversations and infrastructure tasks | Conversation context, sent per request | US |
| OpenAI | Voice transcription (Whisper) | Audio in transit, transcript returned | US |
| Cloudflare R2 | File storage | User-uploaded files, encrypted | Global edge |
| Upstash | Redis cache and rate limiting | Session tokens, rate counters, never user content | US |
| Resend | Transactional email | Email address, subject line, body of notifications we send you | US |
| Sentry | Error tracking | Error logs, PII-scrubbed | US |
| PostHog | Product analytics | Anonymized event counts, never raw content | EU (chosen for stricter data laws) |
| Google | Gmail/Calendar/Drive OAuth | Only the data you authorize, only when you connect | US |
| WHOOP | Health data integration (Round 17+) | Only the data you authorize | US |

### Footer
> We review this list quarterly. If we add a subprocessor, we'll notify you in-app 30 days before they touch your data.

Last updated: [auto-generated date]

---

## 5. Per-Connect privacy banner

Appears in the modal **above** the OAuth scope grant button, every time a user connects a new account.

### Generic template
> Oria is about to ask **{provider}** for permission to read your {scope-summary}. We'll only read what you authorize. We never write or delete unless you ask us to. You can disconnect anytime in Settings.

### Per provider

**Gmail:**
> Oria will ask Google for read-only access to your Gmail. We'll scan for bills, subscriptions, flights, and other structured signals. We never read messages from senders you've marked confidential. We never send or delete email.

**Google Calendar:**
> Oria will ask Google for access to your Calendar. We'll read your events and, with your permission, add new ones (like reminders or focus blocks). You'll confirm every write before it happens.

**Google Drive:**
> Oria will ask Google for permission to read files you specifically pick using a file picker. We don't get access to your whole Drive, only the files you choose.

**WHOOP:**
> Oria will ask WHOOP for read-only access to your health data: sleep, recovery, strain, workouts. We never share this with anyone. You can disconnect anytime.

---

## 6. Write-action confirmation copy

Every time Oria is about to write, send, archive, label, or modify anything in a user's account.

### Generic template
> Oria is about to {action} on your behalf. Confirm? [Confirm] [Cancel]

### Examples

**Calendar add:**
> Oria is about to add "Investor call with Sarah" to your Google Calendar on Tuesday at 3pm. Confirm?

**Email draft:**
> Oria has drafted a reply to Mom. It will be saved as a draft in your Gmail. You'll need to send it yourself. Continue?

**Email archive:**
> Oria is about to archive 12 messages tagged "newsletter." This moves them out of your inbox. Confirm?

### Rules
- Every write action has a 60-second undo (toast with countdown after confirm).
- Email is never auto-sent. Always saved as draft.
- Destructive actions (archive, delete, modify) require a second confirmation if the action affects more than 5 items.

---

## 7. Confidentiality keyword copy

In Settings > Privacy > Confidentiality:

### Header
> Things Oria should never read.

### Lead
> Add senders, email addresses, subjects, or keywords. Oria will skip any email matching these during scans, and never include them in summaries or insights.

### Examples placeholder
> e.g., therapy@..., divorce, oncology, salary negotiation

### Footer
> Already-scanned data matching these is permanently removed within 24 hours. Audit log entries are kept but anonymized.

---

## 8. Memory transparency

In Settings > Memory > What Oria Knows About You:

### Header
> Everything Oria has remembered about you.

### Lead
> This is the full record. You can delete any entry, edit any entry, or export the entire memory as Markdown.

### Per-entry chip
Each fact Oria has stored shows:
- The fact itself, in plain English
- When it was learned (date)
- Where it came from (email, conversation, manual)
- [Edit] [Delete] buttons

### Footer
> When Oria uses a memory in an answer, you'll see a small chip indicating which memory was used. Click it to jump here.

---

## 9. Account deletion flow

In Settings > Account > Delete account:

### Step 1, confirmation
> You're about to delete your Oria account. Here's what happens:
>
> - Every connector disconnects immediately.
> - All your data is marked deleted in our database.
> - For 30 days, you can restore your account by signing back in.
> - After 30 days, everything is permanently removed from our databases and backups.
>
> Are you sure?
>
> [Delete account] [Cancel]

### Step 2, final confirmation
> Type "DELETE" to confirm.
>
> [text input]
>
> [Permanently delete] [Cancel]

### Step 3, email confirmation
> Sent to user's email:
>
> Subject: Your Oria account is scheduled for deletion
>
> Body: Your account will be permanently deleted on {date + 30 days}. If you change your mind, sign in before then to restore. Reply to this email if you have questions.

---

## 10. Data export

In Settings > Account > Export your data:

### Header
> Get everything Oria has on you.

### Lead
> Your full archive: trackables, memories, conversations, connectors, settings, audit log. Delivered as a zip file with Markdown and JSON.

### Button
> [Generate export]

### After click
> Generating your archive. We'll email you a download link in a few minutes. The link works for 7 days.

---

## 11. Per-context trust differences

Personal context: standard trust messaging.

Investor / Business / Family Office contexts: add a note in the privacy step:
> You're using Oria in a {context} setup. The same privacy rules apply. We don't share data between contexts. Each context has its own audit log.

---

## 12. What changes without re-review

These can be updated by the team without trust review:
- Auto-generated dates ("Last updated")
- Subprocessor list (after the 30-day notification is sent)
- Typo fixes
- Translation refinements

These require full re-review:
- The "What Oria does" / "What Oria never does" lists.
- The /trust page sections.
- The homepage honest-limit line.
- Any change to per-Connect copy.
- Any change to write-action confirmation logic.

---

End of trust messaging. Update when a commitment changes, not when a feature ships.
