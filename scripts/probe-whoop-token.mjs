// Dev-only probe: does the WHOOP token exchange accept our client credentials?
// Sends a deliberately-bogus authorization code with the canonical redirect_uri.
//   invalid_client  -> the WHOOP_CLIENT_SECRET (or id) is wrong/stale  [the bug]
//   invalid_grant   -> credentials OK, the code is just bad (expected)  [secret fine]
//   invalid_request / redirect_uri mismatch -> a redirect_uri problem
// Run: node --env-file=.env.local scripts/probe-whoop-token.mjs
const TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const REDIRECT = "https://heyoria.com/api/oauth/whoop/callback"; // canonical, registered
const id = process.env.WHOOP_CLIENT_ID || "";
const secret = process.env.WHOOP_CLIENT_SECRET || "";
console.log(
  "client_id present:",
  !!id,
  "len",
  id.length,
  "| secret present:",
  !!secret,
  "len",
  secret.length,
);

const res = await fetch(TOKEN, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code: "definitely-not-a-real-code",
    grant_type: "authorization_code",
    client_id: id,
    client_secret: secret,
    redirect_uri: REDIRECT,
  }),
});
console.log("status:", res.status);
console.log("body:", (await res.text()).slice(0, 400));
