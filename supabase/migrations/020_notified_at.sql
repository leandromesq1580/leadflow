-- 020_notified_at.sql
-- Rede de segurança das notificações de lead.
-- `notified_at` marca quando o lead teve a notificação completa (grupo + comprador)
-- entregue de verdade. O cron poll-leads reenvia qualquer lead atribuído recente
-- com notified_at IS NULL (pega o que falhou por flap/queda da bridge).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- Backfill: marca os leads JÁ atribuídos como notificados, pra reconciliação não
-- reenviar histórico (assume que o que já foi entregue, foi). Só os novos/falhos
-- ficam null e entram na fila de reenvio.
UPDATE leads
   SET notified_at = COALESCE(assigned_at, created_at)
 WHERE assigned_to IS NOT NULL
   AND notified_at IS NULL;

-- Índice parcial: o cron busca exatamente "atribuídos não notificados".
CREATE INDEX IF NOT EXISTS idx_leads_unnotified
    ON leads (created_at)
 WHERE assigned_to IS NOT NULL AND notified_at IS NULL;
