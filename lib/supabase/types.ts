// Hand-written types matching supabase/migrations/0001_init.sql.
// Re-generate with `supabase gen types typescript` once a project is linked.

export type Role =
  | "owner"
  | "assistant"
  | "staff"
  | "household"
  | "accountant"
  | "external";

export type Section =
  | "household"
  | "travel"
  | "properties"
  | "staff"
  | "events"
  | "finance"
  | "legal"
  | "personal"
  | "vendors"
  | "health";

export type EventKind =
  | "upload"
  | "ai"
  | "reminder"
  | "approval"
  | "event"
  | "staff"
  | "travel"
  | "property"
  | "household"
  | "schedule";

export type UploadStatus = "received" | "processing" | "filed" | "failed";

export type OrgKind = "personal" | "circle" | "office";

export type AccessLevel = "owner" | "full" | "limited" | "assigned";

export type Visibility = "private" | "circle" | "specific";

export type ReminderSource = "manual" | "suggested" | "system";

export type DocumentType =
  | "receipt"
  | "invoice"
  | "boarding_pass"
  | "ticket"
  | "contract"
  | "itinerary"
  | "schedule"
  | "form"
  | "handwritten_note"
  | "sticky_note"
  | "screenshot"
  | "photo"
  | "scanned_document"
  | "business_card"
  | "resume"
  | "unknown";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [k: string]: Json | undefined }
  | Json[];

type TimestampString = string;
type UUID = string;

export interface Profile {
  id: UUID;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: TimestampString;
  updated_at: TimestampString;
  // Added in migration 0037
  preferred_language?: "en" | "ar" | "fr" | "es";
}

export interface Organization {
  id: UUID;
  slug: string;
  name: string;
  kind: OrgKind;
  description: string | null;
  created_by: UUID | null;
  created_at: TimestampString;
  updated_at: TimestampString;
  archived_at?: TimestampString | null;
  // Added in migration 0037
  content_language?: "en" | "ar" | "fr" | "es";
  // Added in migration 0033
  // Round 13 (migration 0065): abstract category values retired. The stored set
  // is the real-life onboarding template ids plus 'custom' (and null for spaces
  // created before the column existed).
  template_key?:
    | "renter"
    | "homeowner"
    | "parent"
    | "freelancer"
    | "traveler"
    | "teacher"
    | "caregiver"
    | "investor"
    | "custom"
    | null;
  // Added in migration 0044
  things_label?: string | null;
  legacy_sections_hidden_at?: TimestampString | null;
  // Added in migration 0045
  parent_kind?: "personal" | "work";
  is_default_for_kind?: boolean;
  // Added in migration 0046
  accent_color?: string | null;
  shadow_color?: string | null;
  // Added in migration 0064 (soft-delete for the reshape DELETE patch)
  deleted_at?: TimestampString | null;
}

export interface Invite {
  id: UUID;
  organization_id: UUID;
  email: string;
  display_name: string | null;
  title: string | null;
  role: Role;
  access_level: AccessLevel;
  token: string;
  code: string;
  expires_at: TimestampString;
  created_by: UUID | null;
  accepted_at: TimestampString | null;
  revoked_at: TimestampString | null;
  created_at: TimestampString;
}

export interface InviteSection {
  id: UUID;
  invite_id: UUID;
  builtin_section: Section | null;
  custom_section_id: UUID | null;
  created_at: TimestampString;
}

export interface Membership {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  role: Role;
  access_level: AccessLevel;
  created_at: TimestampString;
}

export interface MembershipSection {
  id: UUID;
  membership_id: UUID;
  builtin_section: Section | null;
  custom_section_id: UUID | null;
  created_at: TimestampString;
}

export interface Upload {
  id: UUID;
  organization_id: UUID;
  uploaded_by: UUID | null;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  section: Section | null;
  title: string | null;
  status: UploadStatus;
  metadata: Json;
  created_at: TimestampString;
  updated_at: TimestampString;
  last_opened_at: TimestampString | null;
  last_opened_by: UUID | null;
  document_type: DocumentType | null;
  language: string | null;
  is_handwritten: boolean;
  custom_section_id: UUID | null;
  deleted_at: TimestampString | null;
  deleted_by: UUID | null;
  visibility: Visibility;
  shared_with: UUID[];
  // Auto-categorization (migration 0032)
  section_assigned_by?: "user" | "auto" | null;
  auto_section?: string | null;
  auto_custom_section_id?: UUID | null;
}

export interface Extraction {
  id: UUID;
  upload_id: UUID;
  document_type: DocumentType | null;
  language: string | null;
  secondary_languages: string[];
  is_handwritten: boolean | null;
  script_hints: string[];
  raw_text: string | null;
  facts: Json;
  entities: Json;
  action_items: string[];
  confidence: number | null;
  processor: string;
  processed_at: TimestampString;
}

export interface TimelineEvent {
  id: UUID;
  organization_id: UUID;
  actor_id: UUID | null;
  kind: EventKind;
  title: string;
  detail: string | null;
  upload_id: UUID | null;
  metadata: Json;
  created_at: TimestampString;
}

export interface Reminder {
  id: UUID;
  organization_id: UUID;
  created_by: UUID | null;
  title: string;
  due_at: TimestampString | null;
  done: boolean;
  upload_id: UUID | null;
  source: ReminderSource;
  confirmed_at: TimestampString | null;
  visibility: Visibility;
  assigned_to: UUID | null;
  created_at: TimestampString;
}

export interface CustomSection {
  id: UUID;
  organization_id: UUID;
  name: string;
  icon: string | null;
  profile: Json;
  created_by: UUID | null;
  created_at: TimestampString;
  updated_at: TimestampString;
  deleted_at: TimestampString | null;
}

export interface SectionProfile {
  kinds?: string[];
  mode?: string;
  priority?: string;
  related?: string;
}

export interface SectionSetting {
  id: UUID;
  organization_id: UUID;
  builtin_section: Section | null;
  custom_section_id: UUID | null;
  sort_order: number;
  hidden: boolean;
  /** Added in migration 0044. Overrides the display name for any section
   *  (builtin or custom) when set. */
  custom_label: string | null;
  created_at: TimestampString;
  updated_at: TimestampString;
}

export type SmartSection = "diet" | "bills";

export interface MemoryItem {
  id: UUID;
  organization_id: UUID;
  upload_id: UUID | null;
  document_type: DocumentType | null;
  section: Section | null;
  custom_section_id: UUID | null;
  language: string | null;
  is_handwritten: boolean | null;
  confidence: number | null;
  title: string;
  summary: string | null;
  merchant: string | null;
  amount_value: string | null;
  amount_currency: string | null;
  amount_normalized: number | null;
  occurred_at: TimestampString | null;
  location: string | null;
  payment_method: string | null;
  category: string | null;
  items_purchased: string[];
  raw_text: string | null;
  entities: Json;
  facts: Json;
  // Diet-only structured nutrition (best-effort estimates).
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  // Bills-only structured pattern hints.
  is_recurring: boolean | null;
  recurring_interval: string | null;
  // Cash-flow direction. Set by the extractor when clear, null otherwise.
  direction: "inflow" | "outflow" | null;
  // Smart section routing. Set by the extractor when the content is clearly
  // diet-related or bills-related.
  smart_section: SmartSection | null;
  deleted_at: TimestampString | null;
  deleted_by: UUID | null;
  created_at: TimestampString;
  updated_at: TimestampString;
}

type Insert<T> = Partial<T> & { id?: UUID };
type Update<T> = Partial<T>;

type Table<R> = {
  Row: R;
  Insert: Insert<R>;
  Update: Update<R>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile>;
      organizations: Table<Organization>;
      memberships: Table<Membership>;
      uploads: Table<Upload>;
      timeline_events: Table<TimelineEvent>;
      reminders: Table<Reminder>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      role: Role;
      section: Section;
      event_kind: EventKind;
      upload_status: UploadStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
