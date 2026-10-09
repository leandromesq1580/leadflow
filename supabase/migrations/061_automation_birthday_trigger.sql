-- 061: gatilho de automação "aniversário do cliente" + idempotência anual.
--
-- O índice idx_automation_runs_unique_no_meeting (automation_id, lead_id) trava o reenvio
-- PRA SEMPRE depois do 1º disparo — certo pra gatilhos de uma vez só (estágio, sem resposta),
-- errado pro aniversário, que precisa disparar TODO ANO pro mesmo lead. period_key guarda o
-- ano (texto, ex: '2026') SÓ pros gatilhos recorrentes; os demais continuam com period_key
-- NULL e o comportamento de antes fica intacto (uma linha por automação+lead, pra sempre).

ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check
  CHECK (trigger_type IN ('stage_entered', 'stage_stale', 'no_response', 'meeting_before', 'event_before', 'birthday'));

ALTER TABLE automation_runs ADD COLUMN IF NOT EXISTS period_key TEXT;
COMMENT ON COLUMN automation_runs.period_key IS
  'Ano (texto) do disparo, só pra gatilhos recorrentes (ex.: birthday). NULL nos gatilhos de uma vez só — não muda o comportamento antigo.';

DROP INDEX IF EXISTS idx_automation_runs_unique_no_meeting;
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_unique_no_meeting
  ON automation_runs (automation_id, lead_id)
  WHERE meeting_id IS NULL AND period_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_unique_recurring
  ON automation_runs (automation_id, lead_id, period_key)
  WHERE meeting_id IS NULL AND period_key IS NOT NULL;
