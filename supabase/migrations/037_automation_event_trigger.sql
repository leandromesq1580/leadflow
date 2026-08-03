-- ============================================
-- 037: gatilho "N horas antes de um evento da agenda" — 2026-08-03
--
-- O gatilho de reunião só alcança compromisso COM cliente vinculado. Os eventos que
-- o corretor cria na Agenda ("Reunião Antônio", "Reunião Ingrid/Fernanda") não têm
-- lead nenhum — hoje são 74 no sistema e NENHUM tem lead_id — então nunca disparam
-- nada. Este gatilho olha a agenda direto, com ou sem cliente vinculado.
-- ============================================

ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check
  CHECK (trigger_type IN ('stage_entered', 'stage_stale', 'no_response', 'meeting_before', 'event_before'));

-- evento de agenda sem cliente → o registro de execução precisa aceitar lead nulo
ALTER TABLE automation_runs ALTER COLUMN lead_id DROP NOT NULL;

-- ...e continuar único por (automação, evento). No Postgres, NULL não colide com NULL
-- num índice comum: sem este índice parcial, o mesmo evento dispararia de novo a cada
-- rodada do cron (a cada 30 min) até a hora passar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_runs_unique_evento_sem_lead
  ON automation_runs (automation_id, meeting_id)
  WHERE lead_id IS NULL AND meeting_id IS NOT NULL;
