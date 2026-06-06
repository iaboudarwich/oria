/**
 * Privacy-critical scope-isolation test.
 *
 * Sign in as each known user, switch to each org they belong to, and
 * fetch every privacy-sensitive surface as a fully-authenticated session.
 * Assert that fingerprints from OTHER orgs the user belongs to never
 * appear on a Workspace/Circle context (Personal-owner God's-Eye is the
 * one permitted exception).
 *
 * Usage:
 *   npx tsx --env-file .env.local scripts/test-scope-isolation.mts
 *
 * Requirements:
 *   • node_modules/server-only existing as a no-op shim (tsx can't import
 *     the Next.js dev marker). Create with:
 *       mkdir -p node_modules/server-only && \
 *       printf '{"name":"server-only","version":"0.0.1","main":"index.js"}' > node_modules/server-only/package.json && \
 *       printf 'module.exports = {};' > node_modules/server-only/index.js
 *   • .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *     SUPABASE_SERVICE_ROLE_KEY.
 *
 * Exit code: 0 = clean. 1 = at least one privacy-critical leak.
 *
 * To extend: add a user to PROFILES with `fingerprints` strings that are
 * known to appear in that user's space (filenames, vendor names, etc.)
 * but should never appear in any other space. The test treats those as
 * canary tokens.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SITE = process.env.ORIA_TEST_SITE ?? "https://oria-psi.vercel.app";

type Profile = {
  email: string;
  label: string;
  orgs: Array<{
    id: string;
    name: string;
    kind: "personal" | "office" | "circle";
    /**
     * Strings known to appear in this org's rendered HTML but NOT in
     * any other org's. If any appear on another org's pages, that's a
     * scope leak.
     */
    fingerprints: string[];
  }>;
};

const PROFILES: Profile[] = [
  {
    email: "issamabdar@gmail.com",
    label: "issamabdar (owns Personal + Workspace)",
    orgs: [
      {
        id: "40ba99b8-4a1e-4e91-89f7-26aa34239a46",
        name: "Personal",
        kind: "personal",
        fingerprints: ["Itinerary.pdf", "IMG_6318", "Nour Abou Darwich Resume"],
      },
      {
        id: "f3da0540-25bb-4bd3-8eca-2391a92aca6b",
        name: "Catalina Waterfront",
        kind: "office",
        fingerprints: ["Waterfront", "Catalina Landing", "Stacking Plan", "Variance 2026"],
      },
    ],
  },
];

const SURFACES = [
  "/dashboard",
  "/dashboard/inbox",
  "/dashboard/calendar",
  "/dashboard/reminders",
  "/dashboard/sections/finance",
  "/dashboard/sections/travel",
  "/dashboard/sections/personal",
  "/dashboard/sections/legal",
  "/dashboard/work",
  "/dashboard/work/finance",
  "/dashboard/work/agent",
  "/dashboard/work/analysis",
  "/dashboard/work/invoices",
  "/dashboard/work/contracts",
];

const admin = createClient(SUPABASE_URL, SRK, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const anon = createClient(SUPABASE_URL, ANON, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function mintCookie(email: string, activeOrgId: string): Promise<string> {
  const link = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${SITE}/auth/callback` },
  });
  const otp = link.data.properties?.email_otp as string;
  const verify = await anon.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });
  const session = verify.data.session;
  if (!session) throw new Error(`Failed to mint session for ${email}`);
  const projectRef = new URL(SUPABASE_URL).host.split(".")[0];
  const sessionJson = JSON.stringify(session);
  const b64 = Buffer.from(sessionJson, "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const value = `base64-${b64}`;
  const cookieName = `sb-${projectRef}-auth-token`;
  const CHUNK = 3200;
  const parts: string[] = [];
  if (value.length <= CHUNK) {
    parts.push(`${cookieName}=${value}`);
  } else {
    for (let i = 0; i * CHUNK < value.length; i++) {
      parts.push(`${cookieName}.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    }
  }
  parts.push(`oria_active_org=${activeOrgId}`);
  parts.push("oria_tz=America%2FLos_Angeles");
  return parts.join("; ");
}

type Result = {
  pass: number;
  critical: number;
  byDesign: number;
  failures: string[];
};

async function checkSurfaces(): Promise<Result> {
  const result: Result = { pass: 0, critical: 0, byDesign: 0, failures: [] };
  for (const profile of PROFILES) {
    console.log(`\n========== ${profile.label} ==========`);
    for (const activeOrg of profile.orgs) {
      const isPersonal = activeOrg.kind === "personal";
      console.log(
        `\n--- @ ${activeOrg.name} (${activeOrg.kind}) ${isPersonal ? "(personal-owner God's Eye allowed)" : "(MUST be scope-isolated)"} ---`,
      );
      const cookie = await mintCookie(profile.email, activeOrg.id);
      const otherOrgs = profile.orgs.filter((o) => o.id !== activeOrg.id);
      for (const surface of SURFACES) {
        const res = await fetch(SITE + surface, {
          headers: { Cookie: cookie },
          redirect: "manual",
        });
        const html = await res.text();
        const leaks: string[] = [];
        for (const otherOrg of otherOrgs) {
          for (const fp of otherOrg.fingerprints) {
            if (html.includes(fp)) {
              leaks.push(`'${fp}' (from ${otherOrg.name})`);
            }
          }
        }
        if (leaks.length === 0) {
          console.log(`  ✓ ${surface} (${res.status})`);
          result.pass++;
        } else if (isPersonal) {
          console.log(
            `  ~ ${surface} (${res.status}) ${leaks.length} cross-space refs (by design — Personal owner)`,
          );
          result.byDesign++;
        } else {
          console.log(`  ✗ ${surface} (${res.status}) PRIVACY LEAK:`, leaks.join(", "));
          result.failures.push(
            `${profile.email} @ ${activeOrg.name} → ${surface}: ${leaks.join("; ")}`,
          );
          result.critical++;
        }
      }
    }
  }
  return result;
}

async function checkAsk(result: Result): Promise<void> {
  console.log("\n========== Ask /api/ask scope tests ==========");
  for (const profile of PROFILES) {
    for (const activeOrg of profile.orgs) {
      if (activeOrg.kind !== "office") continue;
      console.log(`\n--- Ask Oria @ ${activeOrg.name} (must NOT cite cross-org sources) ---`);
      const cookie = await mintCookie(profile.email, activeOrg.id);
      const askRes = await fetch(SITE + "/api/ask", {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "what files do I have", history: [] }),
      });
      const text = await askRes.text();
      const otherOrgs = profile.orgs.filter((o) => o.id !== activeOrg.id);
      const leaks: string[] = [];
      for (const line of text.split("\n").filter(Boolean)) {
        try {
          const evt = JSON.parse(line) as {
            type: string;
            sources?: Array<{
              title?: string;
              meta?: { space_name?: string };
            }>;
          };
          if (evt.type === "sources" && evt.sources) {
            for (const s of evt.sources) {
              for (const otherOrg of otherOrgs) {
                if (s.meta?.space_name === otherOrg.name) {
                  leaks.push(`source "${s.title}" from ${otherOrg.name}`);
                }
                for (const fp of otherOrg.fingerprints) {
                  if (s.title?.includes(fp)) {
                    leaks.push(
                      `source title "${s.title}" matches ${otherOrg.name} fingerprint "${fp}"`,
                    );
                  }
                }
              }
            }
          }
        } catch {
          // skip non-json frames
        }
      }
      if (leaks.length === 0) {
        console.log("  ✓ no cross-org sources");
        result.pass++;
      } else {
        console.log("  ✗ PRIVACY LEAK:");
        for (const l of leaks) console.log("    -", l);
        for (const l of leaks) result.failures.push(`Ask @ ${activeOrg.name}: ${l}`);
        result.critical++;
      }
    }
  }
}

const result = await checkSurfaces();
await checkAsk(result);

console.log(
  `\n========== ${result.pass} pass / ${result.critical} CRITICAL / ${result.byDesign} by-design ==========`,
);
if (result.failures.length > 0) {
  console.log("\nPrivacy-critical failures:");
  for (const f of result.failures) console.log(" -", f);
  process.exit(1);
}
console.log("\n✓ All privacy-critical scopes hold.");
