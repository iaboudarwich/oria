import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand/wordmark";
import { createClient } from "@/lib/supabase/server";
import {
  acceptInvite,
  previewInvite,
  tryAcceptInvite,
  type InvitePreview,
} from "@/lib/data/invite-accept";
import {
  ACCESS_LEVEL_BLURBS,
  ACCESS_LEVEL_LABELS,
} from "@/lib/data/access-labels";
import { ArrowRightIcon } from "@/components/ui/icon";

export const metadata = { title: "Join a circle" };

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function InvitePage({
  params,
  searchParams,
}: PageProps) {
  const { token } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auto-accept for signed-in users: the email subject + sender + landing on
  // this URL is enough confirmation. Skip when there's already an error in
  // the URL (came back from a failed accept) so we show that error instead
  // of looping.
  if (user && !error) {
    const result = await tryAcceptInvite(token);
    if (result.ok) {
      redirect("/dashboard");
    }
    redirect(`/invite/${token}?error=${result.reason}`);
  }

  const preview = await previewInvite(token);

  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
          <Wordmark />
          <Link
            href="/"
            className="text-[13px] text-ink-muted hover:text-ink transition-base"
          >
            Back
          </Link>
        </div>
      </header>

      <main className="flex min-h-[calc(100vh-72px)] items-center justify-center px-6 py-12">
        <div className="w-full max-w-[440px] animate-fade-up">
          <InviteBody
            preview={preview}
            token={token}
            authed={!!user}
            authedEmail={user?.email ?? null}
            error={error}
          />
        </div>
      </main>
    </div>
  );
}

function InviteBody({
  preview,
  token,
  authed,
  authedEmail,
  error,
}: {
  preview: InvitePreview | null;
  token: string;
  authed: boolean;
  authedEmail: string | null;
  error: string | undefined;
}) {
  if (!preview) {
    return (
      <ErrorView
        title="Invite not found"
        body="The link might be mistyped, or the invite was revoked. Ask whoever invited you for a fresh one."
      />
    );
  }
  if (preview.revoked_at) {
    return (
      <ErrorView
        title="This invite was revoked"
        body={`The invite to ${preview.organization_name} is no longer active.`}
      />
    );
  }
  if (preview.accepted_at) {
    return (
      <ErrorView
        title="This invite was already used"
        body={`Someone already joined ${preview.organization_name} with this link.`}
      />
    );
  }
  if (new Date(preview.expires_at) < new Date()) {
    return (
      <ErrorView
        title="This invite has expired"
        body={`Ask whoever invited you to ${preview.organization_name} for a fresh link.`}
      />
    );
  }

  const inviter = preview.invited_by_name?.split(/\s+/)[0] ?? null;
  const circle = preview.organization_name;

  return (
    <>
      <p className="text-[11.5px] uppercase tracking-[0.12em] text-ink-faint">
        Circle invite
      </p>
      <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-ink">
        {inviter ? (
          <>
            <span className="text-ink">{inviter}</span> invited you to join{" "}
            <span className="text-ink">{circle}</span>
          </>
        ) : (
          <>
            You&apos;re invited to{" "}
            <span className="text-ink">{circle}</span>
          </>
        )}
      </h1>
      {preview.organization_description ? (
        <p className="mt-2 text-[13.5px] text-ink-muted">
          {preview.organization_description}
        </p>
      ) : null}

      <div className="mt-6 rounded-xl border border-line bg-surface-raised p-3.5">
        <Row label="Invited as">
          <span className="text-[13px] text-ink">
            {preview.display_name || preview.email}
          </span>
          {preview.title ? (
            <span className="rounded bg-ink/[0.05] px-1.5 py-0.5 text-[10.5px] text-ink-muted">
              {preview.title}
            </span>
          ) : null}
        </Row>
        <div className="my-2 h-px bg-line" />
        <Row label="Can see">
          <span className="text-[13px] text-ink">
            {ACCESS_LEVEL_LABELS[preview.access_level]}
          </span>
        </Row>
        <p className="mt-1 pl-[80px] text-[11.5px] text-ink-faint">
          {ACCESS_LEVEL_BLURBS[preview.access_level]}
        </p>
      </div>

      {error ? <ErrorBanner reason={error} /> : null}

      {authed ? (
        <form action={acceptInvite} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-ink text-[14px] text-surface transition-base hover:bg-ink-soft"
          >
            Accept and join {circle}
            <ArrowRightIcon size={14} />
          </button>
          <p className="mt-2 text-center text-[11.5px] text-ink-faint">
            Signed in as {authedEmail}
          </p>
        </form>
      ) : (
        <div className="mt-6 space-y-2">
          <Link
            href={`/signup?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(preview.email)}`}
            className="flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-ink text-[14px] text-surface transition-base hover:bg-ink-soft"
          >
            Create your account
            <ArrowRightIcon size={14} />
          </Link>
          <Link
            href={`/login?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(preview.email)}`}
            className="flex h-11 w-full items-center justify-center rounded-xl border border-line bg-surface text-[14px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
          >
            I already have one
          </Link>
          <p className="mt-3 text-center text-[11.5px] text-ink-faint">
            You&apos;ll join {circle} automatically. Your personal space stays
            private.
          </p>
        </div>
      )}

      <p className="mt-8 text-center text-[11.5px] text-ink-faint">
        Got a code instead?{" "}
        <Link
          href="/invite/code"
          className="text-ink-muted hover:text-ink transition-base"
        >
          Enter it here
        </Link>
      </p>
    </>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[72px] shrink-0 text-[11.5px] text-ink-muted">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

function ErrorView({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="text-[24px] font-semibold tracking-tight text-ink">
        {title}
      </h1>
      <p className="mt-2 text-[13.5px] text-ink-muted">{body}</p>
      <Link
        href="/invite/code"
        className="mt-6 inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-[13px] text-ink-soft transition-base hover:border-line-strong hover:text-ink"
      >
        Have a code instead?
      </Link>
    </>
  );
}

const ERROR_COPY: Record<string, string> = {
  auth: "Sign in first, then try again.",
  missing: "We couldn't find that invite.",
  revoked: "This invite has been revoked.",
  used: "This invite has already been used.",
  expired: "This invite has expired.",
  error: "Something went wrong. Try again.",
};

function ErrorBanner({ reason }: { reason: string }) {
  const message = ERROR_COPY[reason] ?? ERROR_COPY.error;
  return (
    <p className="mt-4 rounded-lg border border-claret/20 bg-claret/5 px-3 py-2 text-[12.5px] text-claret">
      {message}
    </p>
  );
}
