-- Thread persistente do Assistant OpenAI por buyer.
-- Mantém contexto de conversa entre sessões.

ALTER TABLE buyers
  ADD COLUMN IF NOT EXISTS ai_thread_id TEXT;
