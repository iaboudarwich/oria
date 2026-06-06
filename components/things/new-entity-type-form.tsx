"use client";

import { useState, useTransition } from "react";
import { suggestSchemaAction, createEntityType } from "@/lib/data/entity-actions";
import type { FieldDef, FieldType } from "@/lib/data/entities";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "currency", label: "Currency" },
  { value: "enum", label: "Options list" },
  { value: "boolean", label: "Yes / No" },
  { value: "long_text", label: "Long text" },
];

export function NewEntityTypeForm() {
  const [step, setStep] = useState<"name" | "schema">("name");
  const [pluralName, setPluralName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [suggesting, startSuggest] = useTransition();
  const [saving, startSave] = useTransition();

  function handleSuggest(e: React.FormEvent) {
    e.preventDefault();
    if (!pluralName.trim()) return;
    startSuggest(async () => {
      const suggested = await suggestSchemaAction(pluralName.trim(), description.trim());
      setFields(suggested);
      setStep("schema");
    });
  }

  function updateField(i: number, patch: Partial<FieldDef>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function removeField(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addField() {
    setFields((prev) => [
      ...prev,
      { key: `field_${prev.length + 1}`, label: "New field", type: "text", required: false },
    ]);
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("field_schema", JSON.stringify(fields));
    startSave(async () => {
      await createEntityType(fd);
    });
  }

  // ── Step 1: name ──────────────────────────────────────────────────────────
  if (step === "name") {
    return (
      <form onSubmit={handleSuggest} className="space-y-5">
        <div>
          <p className="mb-4 text-[13px] text-ink-muted">
            Tell Oria what kind of thing you want to track. Give it a plural name.
          </p>
          <label className="mb-1 block text-[13px] text-ink">What are you tracking? (plural)</label>
          <input
            type="text"
            value={pluralName}
            onChange={(e) => setPluralName(e.target.value)}
            placeholder='e.g. "Race Cars", "Wineries", "Music Equipment"'
            required
            autoFocus
            className="block h-11 w-full rounded-xl border border-line-strong bg-surface-raised px-3.5 text-[16px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
          />
        </div>
        <div>
          <label className="mb-1 block text-[13px] text-ink-muted">
            Describe it (optional, helps AI suggest better fields)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder='e.g. "Cars I own and want to track maintenance and insurance for"'
            className="block w-full rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-ink"
          />
        </div>
        <button
          type="submit"
          disabled={!pluralName.trim() || suggesting}
          className="transition-base inline-flex h-10 items-center rounded-xl bg-ink px-4 text-[13px] text-surface hover:bg-ink-soft disabled:opacity-50"
        >
          {suggesting ? "Thinking..." : "Suggest fields with AI →"}
        </button>
      </form>
    );
  }

  // ── Step 2: schema review ─────────────────────────────────────────────────
  const singular = pluralName.replace(/s$/i, "").trim() || pluralName;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <input type="hidden" name="label_singular" value={singular} />
      <input type="hidden" name="label_plural" value={pluralName} />

      <div>
        <h2 className="text-[15px] font-medium text-ink">Review fields for {pluralName}</h2>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          AI suggested these fields. Edit, remove, or add more before saving.
        </p>
      </div>

      <div className="space-y-2">
        {fields.map((f, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-3 py-2"
          >
            <input
              type="text"
              value={f.label}
              onChange={(e) => updateField(i, { label: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
              placeholder="Field label"
            />
            <select
              value={f.type}
              onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
              className="h-7 rounded-md border border-line bg-surface-raised px-1.5 text-[11.5px] text-ink-muted outline-none"
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-1 text-[11px] text-ink-faint">
              <input
                type="checkbox"
                checked={f.required ?? false}
                onChange={(e) => updateField(i, { required: e.target.checked })}
                className="h-3 w-3"
              />
              Req
            </label>
            <button
              type="button"
              onClick={() => removeField(i)}
              className="transition-base text-[11px] text-ink-faint hover:text-claret"
            >
              ✕
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addField}
          className="transition-base flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-[12px] text-ink-faint hover:border-line-strong hover:text-ink"
        >
          + Add field
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={fields.length === 0 || saving}
          className="transition-base inline-flex h-10 items-center rounded-xl bg-ink px-4 text-[13px] text-surface hover:bg-ink-soft disabled:opacity-50"
        >
          {saving ? "Saving..." : `Create ${pluralName}`}
        </button>
        <button
          type="button"
          onClick={() => setStep("name")}
          className="transition-base text-[12.5px] text-ink-muted hover:text-ink"
        >
          Back
        </button>
      </div>
    </form>
  );
}
