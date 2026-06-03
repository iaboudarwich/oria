// Shared onboarding/reshape types. No server-only imports: the conversation
// client and the preview client both read these.

export type EngineMode = "initial_setup" | "reconfigure";

/** What the conversation distils about the user. Drives template selection. */
export type UserContext = {
  roles: string[];
  life_contexts: string[];
  chaos_areas: string[];
  data_sources: string[];
  collaborators: string[];
  week_one_priority: string;
  notes: string;
};

export const EMPTY_USER_CONTEXT: UserContext = {
  roles: [],
  life_contexts: [],
  chaos_areas: [],
  data_sources: [],
  collaborators: [],
  week_one_priority: "",
  notes: "",
};

export type QuestionType = "text" | "multiple_choice" | "yes_no";

/** One answered (or skipped) turn in the conversation. */
export type Answer = {
  questionId: string;
  question: string;
  answer: string; // empty string = skipped
  skipped: boolean;
};

export type ConversationState = {
  mode: EngineMode;
  answers: Answer[];
  /** For reconfigure: the user's free-text request that opened the engine. */
  intent?: string;
};

/** The next question to ask, with progress, or the finished context. */
export type EngineStep =
  | {
      done: false;
      question: { id: string; text: string; type: QuestionType; options?: string[] };
      progress: { current: number; total: number };
    }
  | { done: true; userContext: UserContext };

// ── Setup plan (produced by the template generator, executed by the executor) ──

export type PlanSection = {
  key: string;
  title: string;
  icon: string;
  priority: number;
};

export type WorkspacePlan = {
  name: string;
  /** organizations.kind for this node. */
  kind: "personal" | "office" | "circle";
  description: string;
  accent_color: string | null;
  sections: PlanSection[];
  ask_oria_starters: string[];
  template_id: string;
};

export type SpacePlan = {
  /** Top-level area: a Personal space or a Work area holding workspaces. */
  label: string;
  area: "personal" | "work";
  workspaces: WorkspacePlan[];
};

export type SetupPlan = {
  spaces: SpacePlan[];
};

// ── Reshape patch (F5): a diff against the user's existing structure ──

export type PatchRename = { kind: "org" | "section"; id: string; from: string; to: string };
export type PatchDelete = {
  kind: "org" | "section";
  id: string;
  name: string;
  /** Items archived alongside this target, computed at preview time. */
  itemCount?: number;
};

export type PlanPatch = {
  creates: WorkspacePlan[];
  section_adds: Array<{ orgId: string; section: PlanSection }>;
  renames: PatchRename[];
  deletes: PatchDelete[];
};

export const EMPTY_PATCH: PlanPatch = { creates: [], section_adds: [], renames: [], deletes: [] };

export function patchIsEmpty(p: PlanPatch): boolean {
  return (
    p.creates.length === 0 &&
    p.section_adds.length === 0 &&
    p.renames.length === 0 &&
    p.deletes.length === 0
  );
}
