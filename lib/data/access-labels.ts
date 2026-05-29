// Plain string constants. No server-only imports. safe to use from both
// client and server components.

import type { AccessLevel } from "@/lib/supabase/types";

export const ACCESS_LEVEL_LABELS: Record<AccessLevel, string> = {
  owner: "Owner",
  full: "Full circle access",
  limited: "Selected sections only",
  assigned: "Assigned items only",
};

export const ACCESS_LEVEL_BLURBS: Record<AccessLevel, string> = {
  owner: "Manages members, sections, and circle settings.",
  full: "Sees everything shared with the circle.",
  limited: "Sees the sections you pick, plus items shared directly.",
  assigned: "Only sees items shared with them by name.",
};
