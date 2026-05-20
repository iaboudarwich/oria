import "server-only";
import { Resend } from "resend";

/**
 * Resend client. Lazy + safe to call when not configured:
 * during local dev without RESEND_API_KEY, every sender becomes a no-op
 * and the UI tells the owner to share the link directly.
 */

let cached: Resend | null = null;

export function getResend(): Resend | null {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  cached = new Resend(key);
  return cached;
}

export function getFromAddress(): string | null {
  // Format accepted by Resend: "Name <address@domain.com>" or just the email.
  const raw = process.env.RESEND_FROM_EMAIL;
  if (!raw) return null;
  return raw;
}

export function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.RESEND_FROM_EMAIL;
}
