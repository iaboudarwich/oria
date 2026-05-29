/**
 * Per-document-type Zod schemas for structured entity extraction.
 * Each schema matches what the LLM is asked to produce for that doc type.
 * All date fields ISO 8601. All currency fields ISO 4217.
 * Use .optional() liberally — extraction is lossy; empty beats wrong.
 */

import { z } from "zod";

// ── Shared atoms ──────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional();
const isoDatetime = z.string().regex(/^\d{4}-\d{2}-\d{2}T/).optional();
const currency = z.string().length(3).optional();
const amount = z.number().optional();

const lineItem = z.object({
  name: z.string(),
  qty: z.number().optional(),
  price: z.number().optional(),
});

// ── 9 doc-type schemas ────────────────────────────────────────────────────────

export const ReceiptSchema = z.object({
  merchant: z.string(),
  total: amount,
  currency,
  date: isoDate,
  line_items: z.array(lineItem).optional(),
  category_guess: z
    .enum([
      "groceries",
      "dining",
      "transport",
      "lodging",
      "medical",
      "services",
      "retail",
      "other",
    ])
    .optional(),
});

export const InvoiceSchema = z.object({
  vendor: z.string(),
  total: amount,
  currency,
  issue_date: isoDate,
  due_date: isoDate,
  invoice_number: z.string().optional(),
  line_items: z.array(lineItem).optional(),
});

export const LeaseSchema = z.object({
  landlord: z.string(),
  tenants: z.array(z.string()),
  property_address: z.string(),
  start_date: isoDate,
  end_date: isoDate,
  monthly_rent: amount,
  currency,
  renewal_terms: z.string().optional(),
});

export const ContractSchema = z.object({
  parties: z.array(z.string()),
  contract_type: z
    .enum(["employment", "nda", "service", "partnership", "other"])
    .optional(),
  effective_date: isoDate,
  termination_date: isoDate,
  renewal_date: isoDate,
  summary: z.string().optional(),
});

export const FlightSchema = z.object({
  airline: z.string(),
  flight_number: z.string(),
  origin_airport: z.string().length(3).optional(),
  destination_airport: z.string().length(3).optional(),
  departure_datetime: isoDatetime,
  arrival_datetime: isoDatetime,
  passenger_names: z.array(z.string()).optional(),
  confirmation_code: z.string().optional(),
});

export const PrescriptionSchema = z.object({
  medication: z.string(),
  dosage: z.string(),
  prescriber: z.string().optional(),
  fill_date: isoDate,
  refills_remaining: z.number().int().optional(),
});

export const StatementSchema = z.object({
  institution: z.string(),
  account_last_4: z.string().length(4).optional(),
  statement_period_start: isoDate,
  statement_period_end: isoDate,
  ending_balance: amount,
  currency,
});

export const IdDocumentSchema = z.object({
  document_type: z
    .enum(["passport", "drivers_license", "national_id", "other"])
    .optional(),
  number_masked: z.string().optional(), // first chars replaced with *
  expiration_date: isoDate,
  name_on_document: z.string(),
});

export const GenericSchema = z.object({
  title: z.string().max(80),
  summary: z.string().optional(),
  key_dates: z
    .array(z.object({ label: z.string(), date: z.string() }))
    .optional(),
  key_amounts: z
    .array(
      z.object({ label: z.string(), amount: amount, currency: z.string().optional() })
    )
    .optional(),
});

// ── Registry ──────────────────────────────────────────────────────────────────

export const DOC_TYPES = [
  "receipt",
  "invoice",
  "lease",
  "contract",
  "flight",
  "prescription",
  "statement",
  "id_document",
  "generic",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export type ExtractedFields = {
  receipt: z.infer<typeof ReceiptSchema>;
  invoice: z.infer<typeof InvoiceSchema>;
  lease: z.infer<typeof LeaseSchema>;
  contract: z.infer<typeof ContractSchema>;
  flight: z.infer<typeof FlightSchema>;
  prescription: z.infer<typeof PrescriptionSchema>;
  statement: z.infer<typeof StatementSchema>;
  id_document: z.infer<typeof IdDocumentSchema>;
  generic: z.infer<typeof GenericSchema>;
};

export const SCHEMAS: Record<DocType, z.ZodTypeAny> = {
  receipt: ReceiptSchema,
  invoice: InvoiceSchema,
  lease: LeaseSchema,
  contract: ContractSchema,
  flight: FlightSchema,
  prescription: PrescriptionSchema,
  statement: StatementSchema,
  id_document: IdDocumentSchema,
  generic: GenericSchema,
};

/**
 * Static field descriptions used in prompts.
 * Avoids Zod v4 runtime introspection incompatibilities.
 */
const SCHEMA_DESCRIPTIONS: Record<DocType, Record<string, string>> = {
  receipt: {
    merchant: "string — store or restaurant name",
    total: "number — total amount paid",
    currency: "string — ISO 4217 code e.g. USD",
    date: "string — YYYY-MM-DD",
    line_items: "array of {name, qty?, price?} — optional",
    category_guess: "groceries|dining|transport|lodging|medical|services|retail|other",
  },
  invoice: {
    vendor: "string — company issuing invoice",
    total: "number — invoice total",
    currency: "string — ISO 4217",
    issue_date: "string — YYYY-MM-DD",
    due_date: "string — YYYY-MM-DD — optional",
    invoice_number: "string — optional",
    line_items: "array of {name, qty?, price?} — optional",
  },
  lease: {
    landlord: "string",
    tenants: "array of strings",
    property_address: "string",
    start_date: "string — YYYY-MM-DD",
    end_date: "string — YYYY-MM-DD",
    monthly_rent: "number",
    currency: "string — ISO 4217",
    renewal_terms: "string — optional free text",
  },
  contract: {
    parties: "array of strings",
    contract_type: "employment|nda|service|partnership|other",
    effective_date: "string — YYYY-MM-DD",
    termination_date: "string — YYYY-MM-DD — optional",
    renewal_date: "string — YYYY-MM-DD — optional",
    summary: "string — 1-2 sentences — optional",
  },
  flight: {
    airline: "string",
    flight_number: "string e.g. AA123",
    origin_airport: "string — 3-letter IATA e.g. JFK",
    destination_airport: "string — 3-letter IATA",
    departure_datetime: "string — ISO 8601 e.g. 2024-03-15T14:30:00",
    arrival_datetime: "string — ISO 8601 — optional",
    passenger_names: "array of strings — optional",
    confirmation_code: "string — optional",
  },
  prescription: {
    medication: "string — drug name",
    dosage: "string e.g. 10mg twice daily",
    prescriber: "string — doctor name — optional",
    fill_date: "string — YYYY-MM-DD",
    refills_remaining: "integer — optional",
  },
  statement: {
    institution: "string — bank or card issuer",
    account_last_4: "string — exactly 4 digits",
    statement_period_start: "string — YYYY-MM-DD",
    statement_period_end: "string — YYYY-MM-DD",
    ending_balance: "number",
    currency: "string — ISO 4217",
  },
  id_document: {
    document_type: "passport|drivers_license|national_id|other",
    number_masked: "string — replace all but last 4 chars with *",
    expiration_date: "string — YYYY-MM-DD",
    name_on_document: "string",
  },
  generic: {
    title: "string — document title under 80 chars",
    summary: "string — 1-3 sentences describing the document",
    key_dates: "array of {label: string, date: string YYYY-MM-DD} — optional",
    key_amounts: "array of {label: string, amount: number, currency: string ISO4217} — optional",
  },
};

/** Return a human-readable field description for prompting. */
export function schemaDescription(docType: DocType): string {
  return JSON.stringify(SCHEMA_DESCRIPTIONS[docType], null, 2);
}
