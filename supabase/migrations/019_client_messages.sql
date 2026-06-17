-- ============================================
-- 019: Atendimento a Clientes (compradores) — canal separado dos leads
-- ============================================
-- Mensagens trocadas com os CLIENTES (compradores de leads), no mesmo número
-- de WhatsApp, mas separadas das conversas com leads. Só admins acessam.

CREATE TABLE IF NOT EXISTS client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  from_phone TEXT,
  to_phone TEXT,
  body TEXT,
  media_type TEXT,
  media_url TEXT,
  wa_message_id TEXT,
  status TEXT DEFAULT 'received',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_messages_buyer ON client_messages(client_buyer_id);
CREATE INDEX IF NOT EXISTS idx_client_messages_created ON client_messages(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_messages_waid ON client_messages(wa_message_id) WHERE wa_message_id IS NOT NULL;

-- RLS ligado sem policies = só service role (APIs admin) acessa
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;
