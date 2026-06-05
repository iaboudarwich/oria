import { readFileSync } from "node:fs";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

// One-off operational sender: delivers a generic test push to every stored
// subscription via the same web-push + VAPID path the server uses. Reads the
// subscription via the service-role client so the keys are never printed.

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

webpush.setVapidDetails(
  env.VAPID_SUBJECT,
  env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  env.VAPID_PRIVATE_KEY,
);

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Same generic payload shape the /api/push/test route sends.
const payload = JSON.stringify({
  title: "Oria",
  body: "Test notification. Push is working.",
  url: "/dashboard",
  tag: "oria-test",
});

const { data: subs, error } = await supa
  .from("push_subscriptions")
  .select("endpoint, p256dh, auth");
if (error) {
  console.error("DB error:", error.message);
  process.exit(1);
}

console.log(`subscriptions found: ${subs.length}`);
for (const s of subs) {
  try {
    const res = await webpush.sendNotification(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload,
    );
    console.log(`-> ${new URL(s.endpoint).host}: HTTP ${res.statusCode} (accepted by push service)`);
  } catch (e) {
    console.log(`-> ${new URL(s.endpoint).host}: FAILED statusCode=${e.statusCode} ${e.body || ""}`);
  }
}
