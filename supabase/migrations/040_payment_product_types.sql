-- Historico financeiro unificado: pacotes, leads frios e assinatura CRM.
-- A producao ja usa estes tipos; esta migration elimina o desvio entre o banco
-- documentado no repositorio e os dados gravados pelos webhooks Stripe/Apple.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_product_type_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_product_type_check
  CHECK (product_type IN ('lead', 'cold_lead', 'appointment', 'crm'));
