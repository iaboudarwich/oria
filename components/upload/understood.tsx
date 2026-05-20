import {
  DOCUMENT_TYPE_LABEL,
  entitiesToGroups,
  factsToRows,
  languageName,
} from "@/lib/data/upload-intelligence";
import type { Extraction, UploadStatus } from "@/lib/supabase/types";

type Props = {
  extraction: Extraction | null;
  status: UploadStatus;
};

/**
 * "Understood" panel.
 * Shown only when there is something meaningful to display. The stub
 * pipeline today produces classification + section only; richer fields
 * (facts, entities, action_items, language) appear as real OCR is wired.
 */
export function UnderstoodPanel({ extraction, status }: Props) {
  if (status === "received" || status === "processing") {
    return (
      <section>
        <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
          Oria is reading
        </h2>
        <p className="px-1 text-[12.5px] text-ink-faint">
          Looking at the file. This usually takes a moment.
        </p>
      </section>
    );
  }

  if (!extraction || extraction.document_type === null) {
    return null;
  }

  const docLabel = extraction.document_type
    ? DOCUMENT_TYPE_LABEL[extraction.document_type]
    : null;
  const lang = languageName(extraction.language);
  const facts = factsToRows(extraction.facts);
  const groups = entitiesToGroups(extraction.entities);
  const actions = extraction.action_items ?? [];

  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
        Understood
      </h2>

      <div className="rounded-xl border border-line bg-surface-raised p-4">
        <p className="text-[14px] text-ink">
          {docLabel}
          {extraction.is_handwritten ? (
            <span className="text-ink-muted"> · handwritten</span>
          ) : null}
          {lang ? (
            <span className="text-ink-muted"> · {lang}</span>
          ) : null}
        </p>

        {facts.length > 0 ? (
          <dl className="mt-4 grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-6">
            {facts.map((f) => (
              <div
                key={f.key}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="text-[12px] text-ink-faint">{f.label}</dt>
                <dd className="truncate text-[12.5px] text-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {groups.length > 0 ? (
          <div className="mt-4 space-y-2">
            {groups.map((g) => (
              <div key={g.label} className="flex flex-wrap items-baseline gap-x-2">
                <p className="text-[11.5px] text-ink-faint">{g.label}</p>
                <p className="text-[12.5px] text-ink">{g.items.join(", ")}</p>
              </div>
            ))}
          </div>
        ) : null}

        {actions.length > 0 ? (
          <div className="mt-4">
            <p className="text-[11.5px] text-ink-faint mb-1.5">Action items</p>
            <ul className="space-y-1">
              {actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink">
                  <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
