-- Trial de 7 dias: novo usuário recebe acesso ao CRM Pro por 7 dias após cadastro.
-- Gates checam: crm_plan='pro' OR trial_ends_at > now() OR is_admin.

ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- Backfill: todos os buyers existentes recebem 7 dias de trial a partir de agora.
-- (Exceto admins e quem já é pro — esses não precisam.)
UPDATE buyers
SET trial_ends_at = now() + interval '7 days'
WHERE trial_ends_at IS NULL
  AND is_admin IS NOT TRUE
  AND (crm_plan IS NULL OR crm_plan <> 'pro');

CREATE INDEX IF NOT EXISTS idx_buyers_trial_ends_at ON buyers(trial_ends_at) WHERE trial_ends_at IS NOT NULL;
