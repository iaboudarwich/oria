// Repro for the WHOOP OAuth bad_state bug. Mints a dev session, hits the real
// start + callback routes against `next start`, and prints exactly what the
// state cookie + state param do across the round trip.
//
// Run: node --env-file=.env.local scripts/repro-whoop-oauth.mjs

const BASE = process.env.REPRO_BASE || "http://localhost:3000";
const EMAIL = process.env.ORIA_A11Y_EMAIL || "issamabdar@gmail.com";

async function mintAuthCookies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !srk || !anonKey) throw new Error("missing supabase env");
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, srk, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  const otp = link.data.properties?.email_otp;
  const verify = await anon.auth.verifyOtp({ email: EMAIL, token: otp, type: "email" });
  const session = verify.data.session;
  if (!session) throw new Error("no session");
  const ref = new URL(url).host.split(".")[0];
  const value =
    "base64-" +
    Buffer.from(JSON.stringify(session), "utf8")
      .toString("base64")
      .replace(/=+$/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  const name = `sb-${ref}-auth-token`;
  const CHUNK = 3200;
  const parts = [];
  if (value.length <= CHUNK) parts.push(`${name}=${value}`);
  else for (let i = 0; i * CHUNK < value.length; i++) parts.push(`${name}.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  parts.push("oria_tz=America/Los_Angeles");
  return parts.join("; ");
}

function setCookies(res) {
  return typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
}

const cookie = await mintAuthCookies();

// 0. Attribute comparison: WHOOP vs the working Google connect.
console.log("== COOKIE ATTRIBUTE COMPARISON ==");
for (const [label, path] of [
  ["WHOOP ", "/api/oauth/whoop/start"],
  ["Google", "/api/oauth/google/connect?service=calendar"],
]) {
  const r = await fetch(`${BASE}${path}`, { headers: { cookie }, redirect: "manual" });
  const sc = setCookies(r);
  const stateLine = sc.find((s) => /state/.test(s)) || "(no state cookie set)";
  console.log(`${label}: ${stateLine}`);
}
console.log("");

// 1. START
const start = await fetch(`${BASE}/api/oauth/whoop/start`, { headers: { cookie }, redirect: "manual" });
const loc = start.headers.get("location") || "";
const sc = setCookies(start);
console.log("== START ==");
console.log("status:", start.status);
console.log("location:", loc.slice(0, 90));
console.log("set-cookie:", sc.map((s) => s.split(";")[0]));
const stateParam = (() => { try { return new URL(loc).searchParams.get("state"); } catch { return null; } })();
const scState = (sc.find((s) => s.startsWith("whoop_oauth_state=")) || "").split(";")[0].split("=")[1] || null;
console.log("state in redirect:", stateParam);
console.log("state in cookie  :", scState);
console.log("MATCH:", !!stateParam && stateParam === scState);

// 2. CALLBACK with the cookie present (fake code -> should pass state, fail later)
const cbWith = await fetch(`${BASE}/api/oauth/whoop/callback?code=fake&state=${stateParam}`, {
  headers: { cookie: `${cookie}; whoop_oauth_state=${scState}` },
  redirect: "manual",
});
console.log("\n== CALLBACK (cookie present) ==");
console.log("location:", cbWith.headers.get("location"));

// 3. CALLBACK without the state cookie (simulates the cross-host case). With the
//    signed-state fix this should now PASS the state check (reach exchange).
const cbWithout = await fetch(`${BASE}/api/oauth/whoop/callback?code=fake&state=${stateParam}`, {
  headers: { cookie },
  redirect: "manual",
});
console.log("\n== CALLBACK (cookie absent, cross-host) ==");
console.log("location:", cbWithout.headers.get("location"));

// 4. CALLBACK with a TAMPERED state (flip last char) -> must be rejected.
const tampered = stateParam.slice(0, -1) + (stateParam.endsWith("a") ? "b" : "a");
const cbTamper = await fetch(`${BASE}/api/oauth/whoop/callback?code=fake&state=${tampered}`, {
  headers: { cookie },
  redirect: "manual",
});
console.log("\n== CALLBACK (tampered state) ==");
console.log("location:", cbTamper.headers.get("location"));
