-- F1: the classifier now detects appointments (medical, professional services).
-- Extend the email_detected_items.item_type CHECK to accept 'appointment'.

ALTER TABLE public.email_detected_items
  DROP CONSTRAINT IF EXISTS email_detected_items_item_type_check;

ALTER TABLE public.email_detected_items
  ADD CONSTRAINT email_detected_items_item_type_check
  CHECK (item_type IN (
    'subscription', 'bill', 'flight', 'booking', 'receipt', 'appointment', 'other'
  ));
