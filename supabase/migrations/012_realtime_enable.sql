-- Habilita Supabase Realtime nas tabelas-chave pra notificacoes em tempo real.
-- Apos isso, INSERTs nessas tabelas sao broadcasted via WebSocket pro client.

-- whatsapp_messages: msg nova chega no inbox sem F5
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;

-- pipeline_leads: lead novo no pipeline aparece sem F5
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_leads;

-- follow_ups: follow-up novo aparece na thread / card
ALTER PUBLICATION supabase_realtime ADD TABLE follow_ups;

-- leads: mudanca de assigned_to / contract_closed / status propaga
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
