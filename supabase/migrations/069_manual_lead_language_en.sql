-- Contact language for manually created leads. No changes to purchases/credits,
-- default language, existing rows, ownership, campaigns or automatic messages.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lead_language_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_lead_language_check
  CHECK (lead_language IN ('pt', 'es', 'en'));
COMMIT;
