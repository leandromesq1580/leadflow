-- Multi-bridge WhatsApp: cada buyer tem a propria conexao de WhatsApp.
-- Isso acaba com o vazamento de privacidade onde msgs saiam todas pelo
-- numero do owner da agencia.

ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS wa_bridge_url TEXT,
  ADD COLUMN IF NOT EXISTS wa_bridge_key TEXT,
  ADD COLUMN IF NOT EXISTS wa_bridge_phone TEXT,
  ADD COLUMN IF NOT EXISTS wa_bridge_status TEXT;
  -- status: null (nao conectou), 'pending_qr', 'connected', 'disconnected'

-- Backfill Regiane (bridge que ja existe)
UPDATE buyers
SET
  wa_bridge_url = 'http://31.220.97.186:3457',
  wa_bridge_key = 'leadflow-bridge-2026',
  wa_bridge_phone = '17867442126',
  wa_bridge_status = 'connected'
WHERE id = 'cabd03e1-90ea-4298-bd0e-5f90ddd879aa';

CREATE INDEX IF NOT EXISTS idx_buyers_wa_bridge_phone ON buyers(wa_bridge_phone) WHERE wa_bridge_phone IS NOT NULL;
