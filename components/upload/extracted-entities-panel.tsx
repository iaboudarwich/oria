"use client";

import { useState, useTransition } from "react";
import { saveEntityEdits } from "@/lib/data/entity-actions";
import type { ExtractedEntity } from "@/lib/data/upload-detail";

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

function formatDate(v: unknown): string {
  if (!v || typeof v !== "string") return "";
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return v;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return v;
  }
}

function formatCurrency(amount: unknown, currency: unknown): string {
  if (amount == null) return "";
  const num = typeof amount === "number" ? amount : parseFloat(str(amount));
  if (isNaN(num)) return str(amount);
  const cur = typeof currency === "string" && currency.length === 3 ? currency : "USD";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(num);
  } catch {
    return `${cur} ${num.toFixed(2)}`;
  }
}

// ── Field row (view + edit) ───────────────────────────────────────────────────

function FieldRow({
  label,
  value,
  editKey,
  editing,
  draft,
  sensitive,
  onDraftChange,
}: {
  label: string;
  value: string;
  editKey: string;
  editing: boolean;
  draft: Record<string, unknown>;
  sensitive?: boolean;
  onDraftChange: (key: string, val: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const displayVal = editing
    ? str(draft[editKey] ?? value)
    : sensitive && !revealed
    ? value.replace(/./g, (c, i) => (i < value.length - 4 ? "*" : c))
    : value;

  if (!value && !editing) return null;

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-line last:border-0">
      <span className="w-32 shrink-0 text-[11.5px] text-ink-faint">{label}</span>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            type="text"
            value={str(draft[editKey] ?? value)}
            onChange={(e) => onDraftChange(editKey, e.target.value)}
            className="w-full rounded bg-canvas px-2 py-0.5 text-[13px] text-ink outline-none border border-line focus:border-ink-soft"
          />
        ) : (
          <span className="text-[13px] text-ink break-words">{displayVal}</span>
        )}
      </div>
      {sensitive && !editing && (
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="shrink-0 text-[11px] text-ink-faint hover:text-ink"
        >
          {revealed ? "Hide" : "Show"}
        </button>
      )}
    </div>
  );
}

// ── Doc-type renderers ────────────────────────────────────────────────────────

function ReceiptView({ f, editing, draft, onDraftChange }: FieldProps) {
  return (
    <>
      <FieldRow label="Merchant" value={str(f.merchant)} editKey="merchant" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Total" value={formatCurrency(f.total, f.currency)} editKey="total" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Date" value={formatDate(f.date)} editKey="date" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Category" value={str(f.category_guess)} editKey="category_guess" editing={editing} draft={draft} onDraftChange={onDraftChange} />
    </>
  );
}

function InvoiceView({ f, editing, draft, onDraftChange }: FieldProps) {
  return (
    <>
      <FieldRow label="Vendor" value={str(f.vendor)} editKey="vendor" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Total" value={formatCurrency(f.total, f.currency)} editKey="total" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Invoice #" value={str(f.invoice_number)} editKey="invoice_number" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Issued" value={formatDate(f.issue_date)} editKey="issue_date" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Due" value={formatDate(f.due_date)} editKey="due_date" editing={editing} draft={draft} onDraftChange={onDraftChange} />
    </>
  );
}

function LeaseView({ f, editing, draft, onDraftChange }: FieldProps) {
  const tenants = Array.isArray(f.tenants) ? f.tenants.join(", ") : str(f.tenants);
  return (
    <>
      <FieldRow label="Tenant(s)" value={tenants} editKey="tenants" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Landlord" value={str(f.landlord)} editKey="landlord" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Address" value={str(f.property_address)} editKey="property_address" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Start" value={formatDate(f.start_date)} editKey="start_date" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="End" value={formatDate(f.end_date)} editKey="end_date" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Monthly rent" value={formatCurrency(f.monthly_rent, f.currency)} editKey="monthly_rent" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Renewal" value={str(f.renewal_terms)} editKey="renewal_terms" editing={editing} draft={draft} onDraftChange={onDraftChange} />
    </>
  );
}

function ContractView({ f, editing, draft, onDraftChange }: FieldProps) {
  const parties = Array.isArray(f.parties) ? f.parties.join(", ") : str(f.parties);
  return (
    <>
      <FieldRow label="Parties" value={parties} editKey="parties" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Type" value={str(f.contract_type)} editKey="contract_type" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Effective" value={formatDate(f.effective_date)} editKey="effective_date" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Terminates" value={formatDate(f.termination_date)} editKey="termination_date" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Renews" value={formatDate(f.renewal_date)} editKey="renewal_date" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Summary" value={str(f.summary)} editKey="summary" editing={editing} draft={draft} onDraftChange={onDraftChange} />
    </>
  );
}

function FlightView({ f, editing, draft, onDraftChange }: FieldProps) {
  const pax = Array.isArray(f.passenger_names) ? f.passenger_names.join(", ") : str(f.passenger_names);
  return (
    <>
      <FieldRow label="Airline" value={`${str(f.airline)} ${str(f.flight_number)}`} editKey="flight_number" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Route" value={`${str(f.origin_airport)} → ${str(f.destination_airport)}`} editKey="destination_airport" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Departs" value={formatDate(f.departure_datetime)} editKey="departure_datetime" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Arrives" value={formatDate(f.arrival_datetime)} editKey="arrival_datetime" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Passengers" value={pax} editKey="passenger_names" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Confirmation" value={str(f.confirmation_code)} editKey="confirmation_code" editing={editing} draft={draft} onDraftChange={onDraftChange} />
    </>
  );
}

function PrescriptionView({ f, editing, draft, onDraftChange }: FieldProps) {
  return (
    <>
      <FieldRow label="Medication" value={str(f.medication)} editKey="medication" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Dosage" value={str(f.dosage)} editKey="dosage" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Prescriber" value={str(f.prescriber)} editKey="prescriber" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Fill date" value={formatDate(f.fill_date)} editKey="fill_date" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Refills left" value={str(f.refills_remaining)} editKey="refills_remaining" editing={editing} draft={draft} onDraftChange={onDraftChange} />
    </>
  );
}

function StatementView({ f, editing, draft, onDraftChange }: FieldProps) {
  return (
    <>
      <FieldRow label="Institution" value={str(f.institution)} editKey="institution" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Account" value={str(f.account_last_4)} editKey="account_last_4" editing={editing} draft={draft} onDraftChange={onDraftChange} sensitive />
      <FieldRow label="Period" value={`${formatDate(f.statement_period_start)} – ${formatDate(f.statement_period_end)}`} editKey="statement_period_end" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Balance" value={formatCurrency(f.ending_balance, f.currency)} editKey="ending_balance" editing={editing} draft={draft} onDraftChange={onDraftChange} />
    </>
  );
}

function IdDocView({ f, editing, draft, onDraftChange }: FieldProps) {
  return (
    <>
      <FieldRow label="Type" value={str(f.document_type)} editKey="document_type" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Name" value={str(f.name_on_document)} editKey="name_on_document" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Number" value={str(f.number_masked)} editKey="number_masked" editing={editing} draft={draft} onDraftChange={onDraftChange} sensitive />
      <FieldRow label="Expires" value={formatDate(f.expiration_date)} editKey="expiration_date" editing={editing} draft={draft} onDraftChange={onDraftChange} />
    </>
  );
}

function GenericView({ f, editing, draft, onDraftChange }: FieldProps) {
  const keyDates = Array.isArray(f.key_dates) ? f.key_dates : [];
  const keyAmounts = Array.isArray(f.key_amounts) ? f.key_amounts : [];
  return (
    <>
      <FieldRow label="Title" value={str(f.title)} editKey="title" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      <FieldRow label="Summary" value={str(f.summary)} editKey="summary" editing={editing} draft={draft} onDraftChange={onDraftChange} />
      {keyDates.map((kd: { label?: unknown; date?: unknown }, i: number) => (
        <FieldRow key={i} label={str(kd.label) || "Date"} value={formatDate(kd.date)} editKey={`key_dates_${i}`} editing={false} draft={{}} onDraftChange={() => {}} />
      ))}
      {keyAmounts.map((ka: { label?: unknown; amount?: unknown; currency?: unknown }, i: number) => (
        <FieldRow key={i} label={str(ka.label) || "Amount"} value={formatCurrency(ka.amount, ka.currency)} editKey={`key_amounts_${i}`} editing={false} draft={{}} onDraftChange={() => {}} />
      ))}
    </>
  );
}

type FieldProps = {
  f: Record<string, unknown>;
  editing: boolean;
  draft: Record<string, unknown>;
  onDraftChange: (key: string, val: string) => void;
};

const RENDERER: Record<string, React.ComponentType<FieldProps>> = {
  receipt: ReceiptView,
  invoice: InvoiceView,
  lease: LeaseView,
  contract: ContractView,
  flight: FlightView,
  prescription: PrescriptionView,
  statement: StatementView,
  id_document: IdDocView,
  generic: GenericView,
};

const TYPE_LABEL: Record<string, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  lease: "Lease",
  contract: "Contract",
  flight: "Flight",
  prescription: "Prescription",
  statement: "Statement",
  id_document: "ID Document",
  generic: "Document",
};

// ── Pending / failed shells ───────────────────────────────────────────────────

export function ExtractedEntitiesPending() {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        What&rsquo;s in this
      </h2>
      <div className="rounded-2xl border border-line bg-surface-raised p-4">
        <div className="space-y-2 animate-pulse">
          <div className="h-3 w-24 rounded bg-line" />
          <div className="h-3 w-40 rounded bg-line" />
          <div className="h-3 w-32 rounded bg-line" />
        </div>
        <p className="mt-3 text-[11.5px] text-ink-faint">Reading this document…</p>
      </div>
    </section>
  );
}

export function ExtractedEntitiesFailed() {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
        What&rsquo;s in this
      </h2>
      <div className="rounded-2xl border border-line bg-surface-raised px-4 py-3">
        <p className="text-[12.5px] text-ink-faint">
          Couldn&rsquo;t extract structured details from this document.
        </p>
      </div>
    </section>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ExtractedEntitiesPanel({
  entity,
  uploadId,
  uploadStatus,
}: {
  entity: ExtractedEntity | null;
  uploadId: string;
  uploadStatus: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Still processing
  if (!entity && (uploadStatus === "received" || uploadStatus === "processing")) {
    return <ExtractedEntitiesPending />;
  }
  // No extraction at all (image, too large, etc.)
  if (!entity) return null;

  const activeFields = entity.user_verified && entity.user_edited_fields
    ? { ...entity.fields, ...entity.user_edited_fields }
    : entity.fields;

  const Renderer = RENDERER[entity.doc_type] ?? GenericView;

  function handleDraftChange(key: string, val: string) {
    setDraft((prev) => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    if (pending) return;
    setSaveError(null);
    const merged = { ...activeFields, ...draft };
    startTransition(async () => {
      const result = await saveEntityEdits(uploadId, merged);
      if (!result.ok) {
        setSaveError(result.error);
      } else {
        setEditing(false);
        setDraft({});
      }
    });
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
          What&rsquo;s in this
        </h2>
        <div className="flex items-center gap-2">
          {entity.user_verified && (
            <span className="text-[10.5px] text-sage-600">✓ Verified</span>
          )}
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setDraft({ ...activeFields });
                setEditing(true);
              }}
              className="text-[11px] text-ink-faint transition-base hover:text-ink"
            >
              Edit
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={pending}
                className="text-[11px] text-ink transition-base hover:underline disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setDraft({}); setSaveError(null); }}
                className="text-[11px] text-ink-faint transition-base hover:text-ink"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface-raised px-4 py-3">
        <p className="mb-3 text-[11.5px] font-medium text-ink-muted">
          {TYPE_LABEL[entity.doc_type] ?? entity.doc_type}
          {" "}
          <span className="font-normal text-ink-faint">
            · {Math.round(entity.confidence * 100)}% confidence
          </span>
        </p>

        <Renderer
          f={activeFields as Record<string, unknown>}
          editing={editing}
          draft={draft}
          onDraftChange={handleDraftChange}
        />

        {saveError && (
          <p className="mt-2 text-[11.5px] text-claret">{saveError}</p>
        )}

        <p className="mt-3 text-[10.5px] text-ink-faint">
          Extracted by AI — verify before relying on these details for important
          decisions.
        </p>
      </div>
    </section>
  );
}
