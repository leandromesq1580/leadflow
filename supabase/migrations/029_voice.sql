-- 029_voice.sql — Ligações (Twilio Programmable Voice) + pool de números local presence.
-- Rodar manualmente no Supabase (SQL Editor). O código é tolerante à ausência destas
-- tabelas (o piloto funciona sem logar), mas com elas você tem histórico + pool.

-- Pool de caller IDs por DDD. area_code -> número comprado no Twilio.
-- Vazio = todas as ligações saem do TWILIO_FROM_NUMBER (o 850). Conforme comprar
-- números por DDD, insira aqui e o local presence passa a casar o estado do lead.
create table if not exists public.voice_numbers (
  id           uuid primary key default gen_random_uuid(),
  area_code    text not null unique,
  phone_number text not null,
  phone_sid    text,
  state        text,
  created_at   timestamptz not null default now()
);

-- Histórico de ligações.
create table if not exists public.calls (
  id           uuid primary key default gen_random_uuid(),
  call_sid     text unique,
  buyer_id     uuid references public.buyers(id) on delete set null,
  lead_id      uuid references public.leads(id) on delete set null,
  from_number  text,
  to_number    text,
  status       text,
  duration_sec integer default 0,
  created_at   timestamptz not null default now()
);

create index if not exists calls_buyer_idx on public.calls (buyer_id, created_at desc);
create index if not exists calls_lead_idx  on public.calls (lead_id, created_at desc);
