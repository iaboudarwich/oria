import { createClient } from "@supabase/supabase-js";

// Service-role client. SERVER-ONLY. Never import in client code.
// Used for trusted bootstrap operations (creating an org/membership for a new user).
// Intentionally untyped: bootstrap writes are simple and short-lived.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
