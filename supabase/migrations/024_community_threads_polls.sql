-- 024_community_threads_polls.sql — Lote 2: threads (responder comentário) + enquetes.
-- Reações ricas e @menção NÃO precisam de migration (reactions.kind é texto livre;
-- menção é só notificação parseada do texto).

-- threads: resposta a comentário
alter table community_comments add column if not exists parent_id uuid references community_comments(id) on delete cascade;
create index if not exists idx_community_comments_parent on community_comments (parent_id);

-- enquetes: novo tipo de post 'poll'
alter table community_posts drop constraint if exists community_posts_kind_check;
alter table community_posts add constraint community_posts_kind_check check (kind in ('sacada','win','post','poll'));

create table if not exists community_poll_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  buyer_id uuid not null references buyers(id) on delete cascade,
  option_index int not null,
  created_at timestamptz not null default now(),
  unique (post_id, buyer_id)
);
create index if not exists idx_community_poll_votes_post on community_poll_votes (post_id);

alter table community_poll_votes enable row level security;
