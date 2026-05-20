-- Oria: add 'resume' to document_type.
-- Idempotent. ALTER TYPE ... ADD VALUE IF NOT EXISTS is safe to re-run.

alter type public.document_type add value if not exists 'resume';
