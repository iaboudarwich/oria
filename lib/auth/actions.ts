"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// Only allow same-app paths as `next` redirect targets — never an external URL.
function safeNext(value: string | null | undefined): string {
  if (!value) return "/dashboard";
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

function authError(
  path: "/login" | "/signup",
  message: string,
  email?: string,
  next?: string,
) {
  const params = new URLSearchParams({ error: message });
  if (email) params.set("email", email);
  if (next) params.set("next", next);
  redirect(`${path}?${params.toString()}`);
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !password) {
    authError("/login", "Email and password required", email, next);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) authError("/login", error.message, email, next);

  redirect(next);
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));

  if (!email || !password) {
    authError("/signup", "Email and password required", email, next);
  }

  const supabase = await createClient();
  // emailRedirectTo carries `next` through the magic-link flow so a user who
  // signs up from an invite lands back on /invite/[token] after confirming.
  const callbackUrl = new URL(`${siteUrl()}/auth/callback`);
  if (next !== "/dashboard") callbackUrl.searchParams.set("next", next);

  const { error, data } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || null },
      emailRedirectTo: callbackUrl.toString(),
    },
  });

  if (error) authError("/signup", error.message, email, next);

  if (!data.session) {
    const params = new URLSearchParams({
      notice: "Check your email to confirm your account.",
      email,
    });
    if (next !== "/dashboard") params.set("next", next);
    redirect(`/login?${params.toString()}`);
  }

  redirect(next);
}

export async function signInWithMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!email) authError("/login", "Email required", undefined, next);

  const supabase = await createClient();
  const callbackUrl = new URL(`${siteUrl()}/auth/callback`);
  if (next !== "/dashboard") callbackUrl.searchParams.set("next", next);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl.toString() },
  });
  if (error) authError("/login", error.message, email, next);

  const params = new URLSearchParams({
    notice: "Check your email for a sign-in link.",
    email,
  });
  if (next !== "/dashboard") params.set("next", next);
  redirect(`/login?${params.toString()}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
