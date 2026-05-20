// Display metadata for built-in sections.
// Data shape lives in lib/data/all-sections.ts; this file owns labels + icons
// so every UI surface can look identical without duplicating constants.

import {
  GiftIcon,
  HeartIcon,
  HomeIcon,
  PersonIcon,
  PlaneIcon,
  PropertiesIcon,
  ScalesIcon,
  StaffIcon,
  TagIcon,
  WalletIcon,
} from "@/components/ui/icon";
import type { Section } from "@/lib/supabase/types";

export const SECTION_META: Record<
  Section,
  { label: string; Icon: React.ComponentType<{ size?: number }> }
> = {
  household: { label: "Household", Icon: HomeIcon },
  travel: { label: "Travel", Icon: PlaneIcon },
  properties: { label: "Properties", Icon: PropertiesIcon },
  staff: { label: "Staff", Icon: StaffIcon },
  events: { label: "Events", Icon: GiftIcon },
  finance: { label: "Finance", Icon: WalletIcon },
  legal: { label: "Legal", Icon: ScalesIcon },
  personal: { label: "Personal", Icon: PersonIcon },
  vendors: { label: "Vendors", Icon: TagIcon },
  health: { label: "Health", Icon: HeartIcon },
};

export const SECTION_LABEL: Record<Section, string> = Object.fromEntries(
  Object.entries(SECTION_META).map(([k, v]) => [k, v.label]),
) as Record<Section, string>;

export function sectionLabel(section: Section | null | undefined): string {
  if (!section) return "Unsorted";
  return SECTION_LABEL[section] ?? "Unsorted";
}

// Fallback icon for custom sections.
export { TagIcon as CustomSectionIcon };
