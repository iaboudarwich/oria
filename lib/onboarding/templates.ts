// Real-life onboarding templates. These are the AI's source material: it
// selects one or more by match_signals/roles and then TAILORS them to the user
// (rewriting section titles into the user's own vocabulary and language,
// reordering by what overwhelms them, adding/removing sections). So the seed
// titles + descriptions here are internal English selection metadata; every
// user-facing string in the produced plan is AI-localized to the user's locale.

export type TemplateSectionSeed = {
  key: string;
  title: string;
  icon: string;
  priority: number;
};

export type TemplateDefinition = {
  id: string;
  displayName: string;
  description: string;
  defaultSpaceType: "personal" | "office" | "circle";
  sections: TemplateSectionSeed[];
  accentSuggestion: string;
  askStarters: string[];
  defaultReminders: string[];
  /** Words/role patterns in a UserContext that suggest this template. */
  matchSignals: string[];
};

function seeds(titles: [string, string][]): TemplateSectionSeed[] {
  return titles.map(([title, icon], i) => ({
    key: title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, ""),
    title,
    icon,
    priority: i,
  }));
}

export const TEMPLATES: TemplateDefinition[] = [
  {
    id: "renter",
    displayName: "Renter",
    description: "Renting a home: lease, rent, utilities, repairs.",
    defaultSpaceType: "personal",
    sections: seeds([
      ["Lease and landlord", "scales"],
      ["Rent payments", "wallet"],
      ["Utilities", "home"],
      ["Repairs and maintenance", "tag"],
      ["Move-in/out", "travel"],
      ["Renters insurance", "scales"],
    ]),
    accentSuggestion: "#3b6ea5",
    askStarters: ["When is rent due?", "What did the landlord say about repairs?"],
    defaultReminders: [],
    matchSignals: ["rent", "renter", "renting", "apartment", "tenant", "lease", "landlord"],
  },
  {
    id: "homeowner",
    displayName: "Homeowner",
    description: "Owning a home: mortgage, tax, insurance, upkeep.",
    defaultSpaceType: "personal",
    sections: seeds([
      ["Mortgage and escrow", "wallet"],
      ["Property tax", "scales"],
      ["Home insurance", "scales"],
      ["Maintenance and repairs", "tag"],
      ["Contractors", "staff"],
      ["Warranties", "scales"],
      ["Utilities", "home"],
    ]),
    accentSuggestion: "#6b7f4b",
    askStarters: ["When is my property tax due?", "Which contractor did the roof?"],
    defaultReminders: [],
    matchSignals: ["homeowner", "own a home", "mortgage", "house", "property", "escrow"],
  },
  {
    id: "parent",
    displayName: "Parent",
    description: "Raising kids: health, school, activities, documents.",
    defaultSpaceType: "personal",
    sections: seeds([
      ["Kids' health", "health"],
      ["School", "scales"],
      ["Activities", "heart"],
      ["Childcare", "staff"],
      ["Family events", "travel"],
      ["Important documents", "scales"],
    ]),
    accentSuggestion: "#c98a3a",
    askStarters: ["When is the next school form due?", "What are the kids' vaccination dates?"],
    defaultReminders: [],
    matchSignals: ["parent", "kids", "children", "child", "mom", "dad", "family", "school"],
  },
  {
    id: "freelancer",
    displayName: "Freelancer",
    description: "Self-employed: clients, invoices, expenses, taxes.",
    defaultSpaceType: "office",
    sections: seeds([
      ["Clients", "staff"],
      ["Invoices and income", "wallet"],
      ["Expenses", "wallet"],
      ["Taxes", "scales"],
      ["Contracts", "scales"],
      ["Tools and subscriptions", "tag"],
    ]),
    accentSuggestion: "#2f5d8a",
    askStarters: ["Which invoices are unpaid?", "What did I spend on tools this quarter?"],
    defaultReminders: [],
    matchSignals: [
      "freelance",
      "freelancer",
      "self-employed",
      "consultant",
      "contractor",
      "solo",
      "clients",
    ],
  },
  {
    id: "traveler",
    displayName: "Frequent Traveler",
    description: "Always on the move: trips, loyalty, documents, expenses.",
    defaultSpaceType: "personal",
    sections: seeds([
      ["Trips", "travel"],
      ["Loyalty programs", "tag"],
      ["Travel documents", "scales"],
      ["Itineraries", "travel"],
      ["Travel expenses", "wallet"],
      ["Frequent flyer accounts", "plane"],
    ]),
    accentSuggestion: "#3a7d8c",
    askStarters: ["When does my passport expire?", "What's my next trip?"],
    defaultReminders: [],
    matchSignals: ["travel", "traveler", "flights", "trips", "frequent flyer", "nomad", "abroad"],
  },
  {
    id: "teacher",
    displayName: "Teacher",
    description: "Educating: lessons, students, grading, school admin.",
    defaultSpaceType: "office",
    sections: seeds([
      ["Lesson planning", "scales"],
      ["Students", "staff"],
      ["Grading", "scales"],
      ["School admin", "home"],
      ["Professional development", "heart"],
      ["Parent communication", "person"],
    ]),
    accentSuggestion: "#4f7a4f",
    askStarters: ["What's due for grading?", "When is the next parent meeting?"],
    defaultReminders: [],
    matchSignals: [
      "teacher",
      "teach",
      "teaching",
      "educator",
      "professor",
      "school",
      "classroom",
      "students",
    ],
  },
  {
    id: "caregiver",
    displayName: "Caregiver",
    description: "Caring for someone: health, meds, appointments, benefits.",
    defaultSpaceType: "personal",
    sections: seeds([
      ["Health and medical", "health"],
      ["Medications", "heart"],
      ["Appointments", "travel"],
      ["Insurance and benefits", "wallet"],
      ["Legal documents", "scales"],
      ["Care team contacts", "staff"],
    ]),
    accentSuggestion: "#9a6b8a",
    askStarters: ["When is the next appointment?", "Which medications are due for a refill?"],
    defaultReminders: [],
    matchSignals: [
      "caregiver",
      "caring for",
      "elderly",
      "parent's health",
      "medication",
      "patient",
      "nurse",
    ],
  },
  {
    id: "investor",
    displayName: "Investor",
    description: "Managing capital: portfolio, deals, LP reports, theses.",
    defaultSpaceType: "office",
    sections: seeds([
      ["Portfolio", "chart"],
      ["Deal flow", "scales"],
      ["LP reports", "wallet"],
      ["Investment theses", "scales"],
    ]),
    accentSuggestion: "#2f6b4f",
    askStarters: ["What's in my current deal flow?", "When is the next LP report due?"],
    defaultReminders: [],
    matchSignals: [
      "investor",
      "investing",
      "portfolio",
      "venture",
      "fund",
      "lp",
      "deals",
      "vc",
      "angel",
    ],
  },
  {
    id: "custom",
    displayName: "Custom",
    description:
      "A blank space when nothing else fits; the AI fills sections from what the user said.",
    defaultSpaceType: "personal",
    sections: [],
    accentSuggestion: "#5b6470",
    askStarters: [],
    defaultReminders: [],
    matchSignals: [],
  },
];

/** Compact catalog string the generator hands to the model for selection. */
export function templateCatalogForPrompt(): string {
  return TEMPLATES.map((t) => {
    const secs = t.sections.map((s) => s.title).join(", ") || "(none)";
    return `- ${t.id} (${t.defaultSpaceType}): ${t.description} Sections: ${secs}. Signals: ${t.matchSignals.join(", ") || "fallback"}`;
  }).join("\n");
}
