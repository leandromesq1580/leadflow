-- Guarda por que a ligação não completou (código SIP e erro do Twilio). Colunas opcionais, sem efeito em dados existentes.
alter table public.calls add column if not exists sip_response_code integer;
alter table public.calls add column if not exists error_code integer;
