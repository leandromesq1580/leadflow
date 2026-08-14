-- 038: trilha de auditoria dos movimentos de kanban (incidente 2026-08-14:
-- fases da Regiane resetadas em massa sem registro de autor).
-- Cada add/move/remove de card grava quem fez, de onde e pra onde.

create table if not exists pipeline_moves (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid,
  pipeline_id uuid,
  stage_id uuid,
  from_pipeline_id uuid,
  from_stage_id uuid,
  action text not null,              -- add | move | remove
  via text,                          -- rota que executou
  actor_buyer_id uuid,               -- conta que operou (sessão)
  actor_auth_user_id uuid,           -- usuário auth por trás da sessão
  actor_member_id uuid,              -- se foi membro de equipe agindo pela conta
  created_at timestamptz not null default now()
);

create index if not exists idx_pipeline_moves_lead on pipeline_moves (lead_id, created_at desc);
create index if not exists idx_pipeline_moves_actor on pipeline_moves (actor_buyer_id, created_at desc);
