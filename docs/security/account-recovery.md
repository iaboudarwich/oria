# Account recovery

How a user regains access when they are locked out, and the manual steps
operators take for the cases software cannot resolve on its own.

## Forgot password

Self-serve, no operator involvement.

1. User clicks "Forgot?" on the sign-in screen, landing on `/auth/forgot`.
2. They enter their email. `requestPasswordReset` calls
   `supabase.auth.resetPasswordForEmail` with a `redirectTo` of
   `/auth/callback?next=/auth/reset`.
3. The email link hits `/auth/callback`, which exchanges the code for a
   recovery session, then forwards to `/auth/reset`.
4. `/auth/reset` collects a new password and calls
   `supabase.auth.updateUser({ password })` via `updatePassword`, which
   audits `auth.password.reset` and redirects to sign-in.

The forgot screen always shows a neutral confirmation ("If an account
exists for that address, a reset link is on its way") so it never reveals
whether an address is registered.

## Email not received / verification

After sign-up, unconfirmed users land on `/auth/verify`, which can resend
the confirmation link. The resend button enforces a 60-second cooldown.

## Lost authenticator (2FA lockout)

This is the case that can require a human. The flow:

1. On the MFA prompt (`/login/mfa`), the user clicks "Lost access to your
   authenticator?" and lands on `/login/mfa/recovery`.
2. The page tells them to **try a backup code first**. At enrollment we
   issue ten single-use backup codes; any one of them can be entered on the
   MFA prompt in place of the 6-digit TOTP code. `verifyAtSignIn` accepts
   either a TOTP code or a backup code.
3. If they have no backup codes left, they are told to email
   `security@heyoria.com` **from the email address on the account**.

### Manual operator process (no backup codes left)

When a user emails `security@heyoria.com` locked out with no backup codes:

1. **Verify identity.** Confirm the request comes from the email address on
   the account. Do not act on a request from any other address. For
   higher-value accounts, ask a second control question (recent activity
   from the audit log, a recent upload title, the workspace name).
2. **Confirm intent and risk.** A lockout removal resets the second factor;
   treat it with the same care as a password reset for a privileged account.
3. **Remove the TOTP factor.** In the Supabase dashboard (Auth > Users >
   the user), delete the user's verified TOTP factor. This drops the
   account back to single-factor (password only) so they can sign in.
4. **Clear our enrollment marker.** Set `profiles.mfa_enrolled_at` back to
   `null` for that user so the app stops treating them as enrolled and the
   "enable 2FA" nudge reappears.
5. **Tell the user to re-enroll immediately** after signing in, and to store
   the new backup codes somewhere safe.
6. **Record it.** Note the action in the audit trail / ops log: who
   requested it, how identity was verified, who actioned it, and when.

### Notes

- Backup codes are stored only as SHA-256 hashes (`mfa_backup_codes`),
  single-use via `consumed_at`. We cannot show a user their codes again;
  if they are out, re-enrollment is the only path.
- TOTP verification is rate-limited to 5 attempts per 15 minutes per user,
  which also covers backup-code attempts on the same screen.
- There is intentionally no automated "email me a 2FA bypass" path: that
  would defeat the second factor. The human step is the control.
