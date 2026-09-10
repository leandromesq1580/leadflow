# Lead4Producers — visão geral da arquitetura

> Status: baseline confirmada por código/infra em 2026-09-09. Ver `docs/architecture/infrastructure.md`
> para detalhes de deploy e `docs/architecture/data-model.md` para o schema.

## O que é

Lead4Producers (marca do produto Lead4Pro) é um marketplace de leads de seguro de
vida para corretores brasileiros nos EUA, com CRM embutido e automação de contato
via WhatsApp/Email/SMS/Voz. Fonte principal de leads: Meta Ads (captura via Graph API).

## Camadas (confirmado por código + infraestrutura acessível)

| Camada | Tecnologia | Onde roda | Acesso do agente |
|---|---|---|---|
| Web + API | Next.js 16 (App Router) | Vercel | API da Vercel via `l4p-vercel`; sem SSH |
| Banco de dados | PostgreSQL (Supabase) | Supabase gerenciado | leitura via `l4p-sql` (role `hermes_readonly`); escrita via `l4p-sql-write` (amarelo) |
| WhatsApp (wa-bridge) | Node.js (`whatsapp-web.js`) | VPS-1 `62.146.229.13`, systemd | SSH `lead4pro-prod` (leitura), `root@` para escrita |
| Chatbot (ChatbotX) | Docker Compose (10 containers), proxy Caddy | VPS-2 `13.140.34.199` | SSH root |
| Pagamentos | Stripe (checkout, subscriptions, billing portal) | externo | sem acesso direto — só via webhook/logs Vercel |
| Email transacional | Resend | externo | sem acesso direto |
| Voz | Twilio (outbound caller ID por estado) | externo | sem acesso direto |
| AI Lead Scoring | Anthropic Claude Haiku | externo | sem acesso direto |
| Tradução de mensagens | provedor configurado no código (`src/lib`) | externo | sem acesso direto |

**Consequência prática:** o caminho de um lead é Meta → Vercel (API) → Supabase →
wa-bridge (VPS-1). SSH só enxerga o último trecho; a maioria dos diagnósticos de
"leads pararam de entrar" exige consultar Supabase e/ou logs da Vercel, não só o VPS.

## Módulos principais do produto (confirmado em `src/app`)

- **Marketplace de leads** — venda de créditos (`hot`/`cold`/`appointment`) via Stripe Checkout.
- **CRM Pro** (assinatura) — Pipeline Kanban, templates, automations, sequences,
  WhatsApp Inbox, AI Lead Scoring, tags, performance analytics, gestão de time/agência.
- **Onboarding** — estados licenciados + janela de disponibilidade.
- **Referral program** — crédito por indicação de assinantes CRM Pro.
- **PWA + push notifications** — Web Push (VAPID) quando lead é distribuído.
- **Admin panel** (`/admin`, `buyers.is_admin = true`) — compradores, leads, appointments,
  Meta Ads insights, receita, configurações globais.

Lista completa de rotas de API existentes (top-level, `src/app/api/`):
`account, admin, ai-consult, analytics, apolices, appointments, audit, auth,
automations, billing, calendar-items, call-assist, call-script, checkout, community,
coupon, cron, follow-ups, health, home, iap, import-leads, leaderboard, leads, m, me,
notes, notification-preferences, nova, onboarding, pipeline-leads, pipelines, policies,
poll-leads, push, queue-position, referral, roteiro, sequences, settings, speed-to-lead,
subscription, tags, team, templates, training, voice, webhook, whatsapp`.
Não repita o comportamento de cada uma aqui — leia o `route.ts` correspondente; código
é a fonte de verdade, este doc só orienta onde procurar.

## Cron jobs (confirmado em `vercel.json`)

```json
{ "path": "/api/poll-leads", "schedule": "*/2 * * * *" },
{ "path": "/api/cron/run-all", "schedule": "*/5 * * * *" }
```

`run-all` dispara os sub-crons internamente (`automations`, `sequences`, `stale-leads`,
`reminders` — ver `src/app/api/cron/*`). Todo o agendamento roda hoje em **Vercel Cron**,
não em crontab de VPS — isso substituiu uma arquitetura anterior descrita como
histórica em `DOCUMENTACAO_SISTEMA.md` (ver seção "Status" abaixo).

## Status de `DOCUMENTACAO_SISTEMA.md` (raiz) e do `.docx`

`DOCUMENTACAO_SISTEMA.md` (748 linhas) tem descrição funcional detalhada de cada
módulo (útil como referência de comportamento), mas seções de infraestrutura
(VPS `31.220.97.186`, "Vercel Hobby plan", cron via crontab) estão **desatualizadas** —
confirmado: o código aponta para `WA_BRIDGE_URL` default `62.146.229.13:3457`
(`src/lib/wa-bridge.ts`, `src/lib/notifications.ts`) e o agendamento real é Vercel Cron
Pro (`vercel.json` + `docs/integrations/meta-ads.md`). Esse arquivo raiz não foi apagado;
tratar como histórico, não como fonte ativa. `Lead4Producers_Documentacao.docx` não foi
lido neste levantamento — decisão sobre seu destino fica pendente com o Leandro.

## UNKNOWN (não confirmado nesta auditoria)

- Conteúdo/atualidade do `Lead4Producers_Documentacao.docx`.
- Se `WA_BRIDGE_URL` na Vercel aponta hoje para `:3457` (porta do serviço admin) ou
  outra porta — variável está `Encrypted`, não lemos o valor (regra de segurança).
