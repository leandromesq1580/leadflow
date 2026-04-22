-- Adiciona 'follow_up' como meeting_source valido em automation_runs.
-- Necessario pro trigger meeting_before pegar reunioes criadas via follow_ups.

ALTER TABLE automation_runs
  DROP CONSTRAINT IF EXISTS automation_runs_meeting_source_check;

ALTER TABLE automation_runs
  ADD CONSTRAINT automation_runs_meeting_source_check
  CHECK (meeting_source IS NULL OR meeting_source IN ('appointment', 'calendar_item', 'follow_up'));
