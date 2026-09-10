# Modelo de dados — semântica confirmada

> Fonte: `information_schema.columns` via `l4p-sql` + uso real no código. Atualize
> este arquivo sempre que uma consulta revelar uma coluna/semântica nova — não
> adivinhe nomes de coluna, confirme antes de escrever aqui.

## `leads` — colunas confirmadas (2026-09-09)

```
age_range, ai_score, ai_score_reason, ai_scored_at, archived, archived_at,
archived_by, assigned_at, assigned_to, assigned_to_member, attendant,
campaign_name, city, closed_at, contract_closed, created_at, delivery_credit_id,
email, form_name, id, interest, is_organic, lead_language, meta_lead_id, name,
notified_at, observation, phone, phone_digits, platform, policy_value,
product_type, raw_data, reason, sms_opted_out, state, status, type, updated_at
```

Semântica que já custou erro no passado (não recalcule do zero):

- **Lead do sistema** = `meta_lead_id IS NOT NULL`. Lead manual/importado/indicação
  não entra em métrica financeira nenhuma.
- **Entregue** = `assigned_to IS NOT NULL`; data de entrega = `assigned_at`.
- **Origem** = `campaign_name` (não existe coluna `source`).
- **Valor** = `policy_value` (não existe `price_paid`).
- **Conversão** = estágio do pipeline (`pipeline_leads` → `pipeline_stages.name` ~
  "Fechado/Ganho"), não o campo `contract_closed`. `pipeline_leads` não tem `buyer_id`.
- **Leads pagos/devidos** = contadores da tabela `credits` (`total_purchased −
  total_used`), nunca recontando `leads`.
- **Fuso do negócio**: Flórida (`America/New_York`). "Hoje/ontem" sempre converte
  `assigned_at`/`created_at` para esse fuso antes de comparar datas.
- **Idioma do lead** = `lead_language` (`pt`/`es`); mapeamento de formulário Meta
  conhecido em `src/lib/lead-language.ts` é autoritativo sobre o idioma da interface.

## Outras tabelas confirmadas em uso (não exaustivo — confira `information_schema`
antes de assumir)

`buyers, credits, payments, pipelines, pipeline_stages, pipeline_leads,
team_members, templates, automations, automation_runs, sequences, sequence_steps,
sequence_enrollments, whatsapp_messages, push_subscriptions, tags, lead_tags,
referral_rewards, follow_ups, attachments, settings, voice_numbers`.

Chaves de configuração conhecidas na tabela `settings` (JSON por `key`):
- `staff_buyers` — lista de UUIDs de funcionários (ver `docs/features/staff-lead-routing.md`)
- `meta_poll_lease`, `meta_poll_health` — controle do poller Meta (ver `docs/integrations/meta-ads.md`)
- `lead_routing.admin_rule` — regra de prioridade admin (ver `docs/incidents/2026-09-01-priority-delivery.md`)

## Migrations

Numeradas sequencialmente em `supabase/migrations/NNN_*.sql`, hoje até `048_manual_lead_email.sql`.
Aplicar sempre com `l4p-sql-write -f supabase/migrations/NNN_x.sql` (amarelo — só após "sim").

## UNKNOWN

- Schema completo de todas as ~25 tabelas (só levantamos `leads` por completo; as
  demais foram inferidas do código, não de `information_schema`).
