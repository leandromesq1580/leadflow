-- 025_community_dm.sql — mensagens diretas (DM 1-a-1) entre membros da comunidade.
create table if not exists community_dm_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references buyers(id) on delete cascade,
  recipient_id uuid not null references buyers(id) on delete cascade,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_dm_pair on community_dm_messages (sender_id, recipient_id, created_at);
create index if not exists idx_dm_recipient_unread on community_dm_messages (recipient_id, read);

alter table community_dm_messages enable row level security;
