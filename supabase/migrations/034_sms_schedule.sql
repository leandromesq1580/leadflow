-- ============================================
-- 034: FILA DE SMS AUTOMÁTICO (decisão 2026-07-29)
-- Antes: ligação sem contato fora da janela TCPA (8h–21h do lead) DESCARTAVA o SMS —
-- o lead não recebia nada e aquele dia não contava como tentativa na régua de troca.
-- Agora: o SMS é AGENDADO pro próximo horário permitido e despachado pelo cron.
-- Usa a própria sms_messages com status='scheduled' (isolado do 'queued' das campanhas).
-- ============================================

ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- Índice do despachante: só as linhas agendadas
CREATE INDEX IF NOT EXISTS idx_sms_scheduled
  ON sms_messages (scheduled_for)
  WHERE status = 'scheduled';
