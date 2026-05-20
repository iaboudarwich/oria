// Plain types describing how a query is scoped to a single section.
// No server-only imports — safe to use from client + server.

import type { Section } from "@/lib/supabase/types";

export type SectionScope =
  | { kind: "builtin"; key: Section; label: string }
  | { kind: "custom"; key: string; label: string }
  | { kind: "smart"; key: "diet" | "bills"; label: string };

export function scopeKey(s: SectionScope): string {
  return `${s.kind}:${s.key}`;
}
