import {
  DOCUMENT_TYPE_LABEL,
  entitiesToGroups,
  factsToRows,
  languageName,
} from "@/lib/data/upload-intelligence";
import { retryUploadProcessing } from "@/lib/data/upload-actions";
import type { Extraction, UploadStatus } from "@/lib/supabase/types";

type Props = {
  uploadId: string;
  extraction: Extraction | null;
  status: UploadStatus;
  /** Optional extraction skip reason from upload.metadata.extraction_skipped. */
  skipReason?: string | null;
};

const SKIP_MESSAGES: Record<string, string> = {
  image_too_large: "The image was too large to read. Oria kept the file.",
  pdf_too_large: "The PDF was too large for one pass. Oria kept the file and you can still search it by name.",
  sheet_too_large: "The spreadsheet was too large to read in one go. Oria kept the file.",
  text_too_large: "The text file was too long for one pass. Oria kept the file.",
  unsupported_type: "Oria can't read this file type yet. It's safely on file.",
  model_unavailable: "Claude isn't connected yet. Oria kept the file so it stays searchable by name.",
  model_error: "Oria couldn't read this file this time. It's safely on file.",
  empty_result: "Oria didn't find anything to extract. The file is still on hand.",
};

/**
 * "Understood" panel.
 * Shown only when there is something meaningful to display. The stub
 * pipeline today produces classification + section only; richer fields
 * (facts, entities, action_items, language) appear as real OCR is wired.
 */
export function UnderstoodPanel({
  uploadId,
  extraction,
  status,
  skipReason,
}: Props) {
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

  if (status === "failed") {
    return (
      <section>
        <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
          Couldn&apos;t read this one
        </h2>
        <div className="flex items-center gap-3 rounded-xl border border-claret/30 bg-claret/[0.05] p-4">
          <p className="flex-1 text-[13px] text-ink">
            Extraction didn&apos;t finish. The file is still on hand —
            try again or move it manually.
          </p>
          <form action={retryUploadProcessing}>
            <input type="hidden" name="id" value={uploadId} />
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-md bg-ink px-2.5 text-[11.5px] text-surface transition-base hover:bg-ink-soft"
            >
              Retry
            </button>
          </form>
        </div>
      </section>
    );
  }

  if (skipReason && SKIP_MESSAGES[skipReason]) {
    return (
      <section>
        <h2 className="mb-3 px-1 text-[13px] font-medium text-ink-muted">
          On file
        </h2>
        <div className="rounded-xl border border-line bg-surface-raised p-4">
          <p className="text-[13px] text-ink">{SKIP_MESSAGES[skipReason]}</p>
        </div>
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
