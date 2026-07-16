-- 031_notification_phone_2.sql — 2º número que também recebe o alerta de NOVO LEAD.
-- Rodar manualmente no Supabase (SQL Editor).
--
-- IMPORTANTE: este número é apenas DESTINATÁRIO. Ele NÃO conecta bridge, não
-- escaneia QR, não configura nada — o alerta sai pela bridge GLOBAL da plataforma
-- (piroli) pra ele, igual mandar mensagem pra qualquer contato. Só precisa ser um
-- número que tenha WhatsApp pra conseguir receber.
--
-- Escopo: SÓ o alerta "Novo Lead". Reunião/follow-up/desconexão/e-mail/SMS
-- continuam indo apenas pro número principal (buyers.phone).

alter table public.buyers
  add column if not exists notification_phone_2 text;

comment on column public.buyers.notification_phone_2 is
  '2o numero (WhatsApp) que tambem recebe o alerta de Novo Lead. Apenas destinatario — nao conecta bridge. Envio best-effort: falha dele NAO afeta notified_at.';
