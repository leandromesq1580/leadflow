-- 039: LEAD ÚNICO (regra inquebrável — 14/08/2026).
-- Um lead NUNCA pode estar em quadros de duas contas diferentes ao mesmo tempo.
-- Trigger no banco: qualquer INSERT/UPDATE em pipeline_leads remove as linhas
-- do mesmo lead que estejam em pipelines de OUTRO buyer — vale pra TODO caminho
-- de código (rotas, webhooks, crons, scripts), não só pra API do kanban.
-- Multi-pipeline dentro da MESMA conta continua permitido.

create or replace function enforce_lead_unico() returns trigger as $$
declare
  novo_dono uuid;
begin
  select buyer_id into novo_dono from pipelines where id = new.pipeline_id;
  if novo_dono is not null then
    delete from pipeline_leads pl
    using pipelines p
    where pl.pipeline_id = p.id
      and pl.lead_id = new.lead_id
      and pl.id <> new.id
      and p.buyer_id is distinct from novo_dono;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lead_unico on pipeline_leads;
create trigger trg_lead_unico
  after insert or update of pipeline_id on pipeline_leads
  for each row execute function enforce_lead_unico();
