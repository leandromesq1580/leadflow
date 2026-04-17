# Lead4Producers — Documentação Completa do Sistema

**Versão:** 1.0
**Data:** 2026-04-16
**Ambiente:** Produção
**URL:** https://lead4producers.com

---

## 1. Visão Geral

**Lead4Producers** é uma plataforma SaaS de marketplace de leads de seguro de vida voltada para corretores brasileiros nos EUA. O sistema combina:

- **Marketplace de leads** (transacional, por unidade)
- **CRM completo** (assinatura recorrente)
- **Automação de contato** (WhatsApp + Email)
- **Inteligência artificial** para priorização

**Público-alvo:** Corretores individuais e agências de seguro de vida atendendo a comunidade brasileira nos EUA.

**Modelo de receita:**
- Venda de leads por pacote (one-time)
- Assinatura CRM Pro ($99/mês ou $950/ano)
- Programa de indicação com crédito para quem indica

---

## 2. Arquitetura Técnica

### Stack principal
- **Frontend/Backend:** Next.js 16 (App Router, Turbopack)
- **Banco de dados:** Supabase (PostgreSQL + Row Level Security)
- **Auth:** Supabase Auth (email + senha)
- **Pagamentos:** Stripe (checkout + customer portal + webhooks)
- **Email transacional:** Resend
- **WhatsApp:** whatsapp-web.js via microserviço wa-bridge (VPS 31.220.97.186:3456)
- **AI:** Anthropic Claude (Haiku 4.5)
- **Push notifications:** Web Push Protocol com VAPID
- **Hospedagem:** Vercel (Hobby plan)
- **Cron jobs:** VPS cron (31.220.97.186) + Vercel Cron (daily)
- **Meta Ads:** Graph API + Marketing API (captura de leads de anúncios)

### Infraestrutura
- **Produção:** Vercel (Next.js app) + Supabase Cloud (DB) + VPS (wa-bridge + cron + Meta polling)
- **Domínio:** lead4producers.com (Vercel aliased)
- **VPS:** 31.220.97.186 — wa-bridge na porta 3456, cron jobs

---

## 3. Módulos e Funcionalidades

### 3.1 Marketplace de Leads

Venda de leads em 3 categorias, por pacote one-time:

| Tipo | Descrição | Preço/unidade |
|---|---|---|
| **Lead Exclusivo (Hot)** | Lead recém-captado, distribuído em tempo real | $18–$22 |
| **Lead Frio** | Lead não distribuído em 7+ dias | $3–$5 |
| **Appointment** | Lead já agendado (reunião confirmada) | $35–$38 |

**Pacotes disponíveis:**
- 10, 25, 50 Leads Hot
- 25, 50, 100 Leads Frios
- 10, 25 Appointments

**Fluxo de compra:**
1. Usuário acessa `/dashboard/credits`
2. Escolhe pacote → clique em "Comprar"
3. Redirecionado para Stripe Checkout
4. Após pagamento, webhook Stripe cria créditos na conta
5. Créditos são consumidos à medida que leads são distribuídos

### 3.2 Distribuição de Leads

**Fonte dos leads:**
- **Meta Ads** — cron no VPS faz poll da Meta Graph API a cada 2min buscando novos leads dos ads ativos
- **Importação manual** — admin pode importar CSV via `/admin/leads`

**Critérios de match (distribuição automática):**
1. Estado do lead deve estar na lista de estados com licença do comprador
2. Interesse do lead deve estar entre os interesses aceitos pelo comprador
3. Comprador deve ter créditos disponíveis
4. Comprador deve estar disponível na janela (dias/horas configurados em Settings)

**Algoritmo:** round-robin entre compradores elegíveis + ponderação por "última vez que recebeu".

**Notificações ao distribuir:**
- Email para o comprador (Resend)
- WhatsApp para o comprador
- WhatsApp para o grupo de admin "Atendimento EUA"
- Push notification (se o comprador instalou PWA)

### 3.3 CRM Pro ($99/mês ou $950/ano)

**Features exclusivas (gated por plano):**
- Pipeline Kanban
- Gestão de time
- Templates de mensagem
- Automations
- Sequences
- Performance Analytics
- Tags
- WhatsApp Inbox
- AI Lead Scoring

**Controle de acesso:** Layout wrapper `<CrmGate/>` verifica `buyers.crm_plan === 'pro'` ou `is_admin`.

### 3.4 Pipeline Kanban (`/dashboard/pipeline`)

- Drag-and-drop com @dnd-kit
- Estágios padrão: Novo Lead → Atendido → Qualificado → Envio Proposta → Negociação → Fechado/Ganho | Perdido
- Estágios customizáveis por comprador (cores, nomes, ordem)
- Cada lead vira um card com: nome, telefone, tags, AI score, última movimentação
- Clique no card abre modal com 4 abas: **Detalhes, Conversa, Follow-ups, Anexos**

### 3.5 Gestão de Time / Agency Mode (`/dashboard/team`)

**Uso:** Agências que compram leads e distribuem para seus agentes.

**Features:**
- Adicionar membros por email
- Auto-link: quando o membro criar conta no sistema, fica linkado automaticamente
- Atribuir leads a membros específicos ou deixar em round-robin
- Cada membro vê seus próprios leads

**Modos de distribuição interna:**
- Manual (agência escolhe quem recebe)
- Auto (round-robin entre ativos)

### 3.6 Onboarding Wizard (`/onboarding`)

Fluxo obrigatório pós-registro em 3 etapas:

1. **Estados com licença** — usuário seleciona estados onde tem licença de seguros
2. **Disponibilidade** — janela de recebimento de leads (dias da semana + horários)
3. **Resumo + primeira compra** — sugestão de compra inicial

**Tracking:** colunas `onboarding_completed_at` e `onboarding_dismissed` em `buyers`.

### 3.7 Templates (`/dashboard/templates`)

**Descrição:** Mensagens pré-escritas de WhatsApp e Email com variáveis dinâmicas.

**Variáveis suportadas:** `{nome}`, `{primeiro_nome}`, `{telefone}`, `{email}`, `{estado}`, `{cidade}`, `{interesse}`, `{agente}`, `{agente_primeiro_nome}`, `{agente_email}`, `{agente_telefone}`

**Templates de sistema (seed):**
- Primeiro contato WhatsApp
- Follow-up 24h/48h/72h
- Reativação de lead frio
- Email de apresentação
- Confirmação de reunião

**Features:**
- CRUD completo (criar, editar, duplicar, deletar)
- Duplicar template de sistema como ponto de partida
- Preview com variáveis substituídas em tempo real

### 3.8 Automations (`/dashboard/automations`)

**Descrição:** Regras condicionais `quando X → faz Y` que disparam automaticamente.

**Triggers disponíveis:**
- **Lead entrou em estágio X** (dispara instantaneamente na mudança de estágio)
- **Lead parado em estágio X por N horas**
- **Lead sem resposta há N horas**

**Ações disponíveis:**
- **Enviar template** (WhatsApp ou Email)
- **Mover para outro estágio**
- **Notificar agente por email**

**Idempotência:** Cada automação roda apenas uma vez por lead (controlado por `automation_runs` com constraint UNIQUE).

**Execução:**
- **Instantâneo:** quando lead muda de estágio no pipeline
- **Cron VPS:** a cada 30min para triggers baseados em tempo

### 3.9 Sequences / Drip Campaigns (`/dashboard/sequences`)

**Descrição:** Sequências de múltiplos passos com delays configuráveis (ex: dia 1 → WhatsApp, dia 3 → Email, dia 7 → ligação).

**Passos suportados:**
- **Enviar template** (WhatsApp ou Email)
- **Esperar** (delay puro)
- **Notificar agente** (email para o corretor)

**Fluxo:**
1. Comprador cria sequence com N passos, cada um com `delay_hours`
2. Enrolla lead via `/api/sequences/enroll` (pode ser manual ou automático via automation)
3. Engine processa passos vencidos a cada 30min via cron VPS
4. Status rastreado: active → completed/paused/stopped

### 3.10 WhatsApp Inbox (aba "Conversa" no lead modal)

**Descrição:** Conversa bidirecional de WhatsApp dentro do sistema. **Diferencial competitivo.**

**Como funciona:**
- **Envio:** aba Conversa no lead modal → composer → `POST /api/whatsapp/messages` → wa-bridge envia e registra
- **Recebimento:** wa-bridge detecta mensagem recebida → POST `/api/webhook/wa-bridge` com apikey → matching por telefone → salvo no banco

**Matching de telefone:** sistema tenta exato, últimos 10 dígitos, últimos 11 dígitos, com/sem `+`.

**Features:**
- Thread agrupada por lead
- Auto-scroll
- Auto-mark-as-read quando abre a aba
- Poll de novas mensagens a cada 10s
- Badges ✓✓ para delivered/read

**Limitações:**
- Grupos são ignorados (só DMs)
- 1 número WhatsApp compartilhado (hoje: 17867442126). Para multi-tenancy, cada comprador precisaria ter seu próprio wa-bridge.

### 3.11 AI Lead Scoring (badge no lead modal + `/api/leads/:id/score`)

**Descrição:** Cada lead recebe um score 0-100 calculado pela Claude AI, com razão explicando o porquê.

**Modelo:** `claude-haiku-4-5-20251001`

**Inputs considerados pelo prompt:**
- Dados do lead (estado, cidade, interesse, fonte, status, idade em dias)
- Completude (tem telefone? email?)
- Engajamento (mensagens enviadas vs respondidas)
- Histórico de follow-ups
- Conteúdo da conversa recente (últimas 20 mensagens)

**Output:**
- `ai_score`: 0-100
- `ai_score_reason`: frase curta em PT-BR
- `ai_scored_at`: timestamp

**Cores/labels:**
- 🔥 HOT (70-100) — verde
- ☀️ MORNO (40-69) — amarelo
- ❄️ FRIO (0-39) — vermelho

**Trigger:**
- Manual (botão "Recalcular" no badge)
- Batch via `scoreStaleLeads(buyerId)` — scora até 20 leads não pontuados nas últimas 24h

**Custo:** ~$0.001 por score (Haiku). $5 de crédito rende ~5.000 scorings.

### 3.12 Tags (picker no lead modal)

**Descrição:** Etiquetas coloridas customizáveis por comprador para categorizar leads.

**Features:**
- Cores: 8 opções (indigo, violeta, rosa, amarelo, verde, ciano, vermelho, cinza)
- Tags únicas por comprador (UNIQUE buyer_id + name)
- Attach/detach direto do lead modal
- Criar tag nova inline (sem sair do modal)

### 3.13 Stale Leads Alerts

**Descrição:** Alertas automáticos quando leads ficam parados no pipeline.

**Dois mecanismos:**
1. **Badge visual** no card do pipeline quando lead está parado 2+ dias
2. **Digest diário por WhatsApp** (às 14h UTC) com lista de todos os leads do comprador parados 3+ dias sem movimentação

**Filtros:** leads já fechados (ganhos ou perdidos) são ignorados.

### 3.14 Dashboard Performance (`/dashboard/performance`)

**KPIs exibidos:**
- Leads recebidos (total no período)
- Taxa de contato (%)
- Taxa de conversão (%)
- Custo por conversão ($)

**Gráficos:**
- Barras de leads por dia (30d rolling)
- Funil do pipeline (estágio → contagem)
- ROI por fonte (hot/cold/appointment — gasto vs convertido)

**Filtros:** 7d / 30d / 90d

**Leaderboard (só para agências):**
Ranking dos membros do time por convertidos, taxa de conversão, receita. Top 3 com medalhas 🥇🥈🥉.

### 3.15 Referral Program (`/dashboard/referral`)

**Descrição:** Cada comprador tem um código de indicação único. Quando alguém se cadastra pelo link e assina CRM Pro, o indicador ganha crédito.

**Recompensas:**
- CRM Pro mensal assinado pelo indicado → **$25** de crédito
- CRM Pro anual assinado pelo indicado → **$100** de crédito

**Fluxo:**
1. Comprador copia link `lead4producers.com/register?ref=XXXX`
2. Novo usuário se cadastra pelo link → fica registrado como `referred_by`
3. Quando o novo usuário assinar CRM Pro → webhook do Stripe detecta e grava `referral_rewards` + incrementa `referral_credit_cents` do indicador

**Tracking idempotente:** UNIQUE constraint em (referred_buyer_id, trigger_event).

**Página do usuário:**
- Crédito acumulado em dólares
- Total de indicações
- Link + botão "Compartilhar" (usa Web Share API ou fallback para WhatsApp Web)
- Histórico das indicações com status

### 3.16 PWA + Push Notifications

**PWA (Progressive Web App):**
- `manifest.json` define app instalável no celular
- Service Worker (`/sw.js`) com cache network-first e handler de push
- Quando usuário acessa pelo celular, o navegador oferece "Adicionar à tela inicial"

**Push Notifications:**
- Componente `<PwaRegister/>` no dashboard layout pede permissão após 8s
- Subscription salva em `push_subscriptions` com VAPID keys
- `pushToBuyer()` envia notificação para todas as subscriptions de um comprador
- **Dispara automaticamente quando novo lead é distribuído**
- Clique na notificação abre o dashboard direto

**VAPID:** chaves configuradas na Vercel.

### 3.17 Stripe Billing Portal

**Descrição:** Auto-atendimento para clientes gerenciarem sua assinatura CRM Pro.

**Funcionalidades habilitadas:**
- Atualizar cartão de crédito
- Baixar invoices
- Ver histórico de pagamentos
- Cancelar assinatura
- Atualizar email de billing

**Acesso:** botão "Gerenciar" no card CRM Pro em `/dashboard/credits` (só aparece para assinantes ativos).

### 3.18 Admin Panel (`/admin`)

**Acesso:** `buyers.is_admin = true`

**Páginas:**
- `/admin` — Dashboard com métricas globais
- `/admin/buyers` — Lista de compradores, ativar/desativar, marcar como agency
- `/admin/leads` — Todos os leads do sistema, filtros, reatribuir manualmente
- `/admin/appointments` — Fila de appointments agendados
- `/admin/ads` — Integração com Meta Ads Insights
- `/admin/revenue` — Relatório de receita (pagamentos completados)
- `/admin/settings` — Configurações globais

---

## 4. Planos e Preços

### Leads (one-time)
| Pacote | Quantidade | Preço total | Por unidade |
|---|---|---|---|
| Lead 10 | 10 leads | $220 | $22 |
| Lead 25 | 25 leads | $500 | $20 |
| Lead 50 | 50 leads | $900 | $18 |
| Cold 25 | 25 leads frios | $125 | $5 |
| Cold 50 | 50 leads frios | $200 | $4 |
| Cold 100 | 100 leads frios | $300 | $3 |
| Appt 10 | 10 appointments | $380 | $38 |
| Appt 25 | 25 appointments | $875 | $35 |

### CRM Pro (recorrente)
| Plano | Preço | Desconto |
|---|---|---|
| Mensal | $99/mês | — |
| Anual | $950/ano (equivale $79/mês) | 20% off (economia $238/ano) |

---

## 5. Integrações Externas

| Integração | Uso | Endpoint / Env |
|---|---|---|
| **Supabase** | DB, auth, RLS | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Stripe** | Pagamentos | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Resend** | Email transacional | `RESEND_API_KEY` |
| **wa-bridge** | WhatsApp send/receive | VPS 31.220.97.186:3456, `WA_BRIDGE_KEY` |
| **Meta Graph API** | Captura leads dos ads | `META_APP_SECRET`, `META_PAGE_TOKEN` |
| **Anthropic Claude** | AI lead scoring | `ANTHROPIC_API_KEY` |
| **VAPID Web Push** | Notificações mobile | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |

---

## 6. Cron Jobs e Processos Agendados

### Vercel Cron (daily — limitação Hobby plan)
- **13h UTC**: `/api/cron/stale-leads` — digest diário de leads parados

### VPS Cron (31.220.97.186 — root crontab)
- **A cada 2min:** `/api/poll-leads` — poll Meta Graph API por novos leads dos ads
- **14h UTC diário:** `/api/cron/stale-leads` (duplicado, fallback)
- **A cada 30min:** `/api/cron/automations` — executa automations baseadas em tempo
- **A cada 30min:** `/api/cron/sequences` — processa passos vencidos das sequences

### Processos VPS permanentes
- **wa-bridge** (port 3456) — `node /opt/wa-bridge/server.js` rodando via nohup
  - Mantém sessão WhatsApp Web conectada (whatsapp-web.js)
  - Envia mensagens (POST `/send`)
  - Recebe mensagens e forwarda pro webhook do app

---

## 7. Segurança

### Row Level Security (RLS)
Todas as tabelas sensíveis têm RLS habilitado com política padrão:
> "Só pode ler/escrever o que pertence ao próprio `buyer_id` (linkado via `auth.uid()`)"

**Tabelas com RLS:**
`buyers`, `leads`, `credits`, `payments`, `follow_ups`, `pipelines`, `pipeline_stages`, `pipeline_leads`, `team_members`, `templates`, `tags`, `lead_tags`, `automations`, `automation_runs`, `sequences`, `sequence_steps`, `sequence_enrollments`, `whatsapp_messages`, `push_subscriptions`, `referral_rewards`, `attachments`.

### Admin bypass
Operações server-side (API routes) usam `createAdminClient()` (service role key) que bypassa RLS. Isso é seguro porque:
- Admin client **nunca** é exposto ao browser
- Toda operação que afeta dados de um buyer valida o `auth_user_id` via `createServerSupabase()` antes

### Cron endpoints
Protegidos por `?secret=` no URL, comparado com `POLL_SECRET` env var.

### Webhooks
- **Stripe:** signature verificada com `STRIPE_WEBHOOK_SECRET`
- **wa-bridge:** `apikey` header verificada com `WA_BRIDGE_KEY`

### Autenticação
- Supabase Auth (email + password)
- Cookies httpOnly com access_token + refresh_token
- Middleware/layouts validam sessão em cada request

---

## 8. Banco de Dados — Schema Resumido

### Tabelas principais

**`buyers`** — compradores (usuários do sistema)
- `id`, `auth_user_id` (FK supabase auth.users), `email`, `name`, `phone`, `whatsapp`
- `is_admin`, `is_agency`, `team_distribution_mode`
- `crm_plan` (free/pro), `crm_billing_interval` (month/year), `crm_subscription_status`, `crm_expires_at`
- `stripe_customer_id`, `stripe_subscription_id`
- `referral_code`, `referred_by`, `referral_credit_cents`
- `onboarding_completed_at`, `onboarding_dismissed`
- `notification_email`, `notification_sms`, `cal_link`

**`leads`** — leads capturados
- `id`, `name`, `phone`, `email`, `state`, `city`, `interest`, `source`, `status`
- `assigned_to` (FK buyers) — quem recebeu
- `assigned_to_member` (FK team_members) — dentro de agência, quem foi designado
- `price_paid` (quanto o buyer pagou por esse lead)
- `ai_score`, `ai_score_reason`, `ai_scored_at`
- `created_at`

**`credits`** — saldo de leads/appointments comprados
- `buyer_id`, `type`, `total_purchased`, `total_used`, `price_per_unit`, `stripe_payment_id`

**`payments`** — histórico de pagamentos
- `buyer_id`, `stripe_session_id`, `amount`, `product_type`, `quantity`, `status`

**`pipelines` + `pipeline_stages` + `pipeline_leads`** — Kanban
- `pipelines` (1 por buyer default), stages (estágios), pipeline_leads (cards)

**`team_members`** — membros de agência
- `buyer_id` (dono da agência), `name`, `email`, `phone`, `auth_user_id` (quando vira buyer)

**`templates`** — mensagens template
- `buyer_id`, `name`, `type` (whatsapp/email), `subject`, `body`, `is_system`

**`automations` + `automation_runs`** — regras automáticas + histórico de execução

**`sequences` + `sequence_steps` + `sequence_enrollments`** — drip campaigns

**`whatsapp_messages`** — histórico de WhatsApp bidirecional
- `buyer_id`, `lead_id`, `direction` (in/out), `body`, `wa_message_id` (UNIQUE), `status`

**`push_subscriptions`** — subscriptions PWA

**`tags` + `lead_tags`** — tags e associações

**`referral_rewards`** — recompensas de indicação

**`follow_ups`** — anotações e atividades em leads

**`attachments`** — arquivos anexados a leads

### Migrations aplicadas
1. `001_initial_schema.sql` — schema inicial
2. `002_business_rules.sql` — regras e triggers
3. `003_team_agency.sql` — agency mode
4. `004_kanban_crm.sql` — pipeline + templates + follow-ups + anexos
5. `005_features_pack.sql` — annual plans + tags + automations + leaderboard + referral
6. `006_inbox_sequences_ai_push.sql` — inbox + sequences + AI scoring + push

---

## 9. Fluxos de Operação

### 9.1 Novo usuário se cadastra
1. Acessa `/register` (opcionalmente `?ref=XXX` para indicação)
2. Cria conta no Supabase Auth
3. Trigger `/api/auth/register` cria registro na tabela `buyers` com referral_code único
4. Se veio com `ref`, grava `referred_by`
5. Redireciona para `/onboarding`
6. Onboarding: seleciona estados, disponibilidade, revisa
7. `onboarding_completed_at` marcado
8. Usuário cai em `/dashboard`

### 9.2 Comprador compra leads
1. `/dashboard/credits` → clica pacote → Stripe Checkout
2. Paga com cartão
3. Stripe chama webhook `/api/webhook/stripe` com `checkout.session.completed`
4. Sistema cria registro em `credits` e `payments`
5. Se for `cold_lead`, distribui leads frios imediatamente
6. Buyer vê saldo atualizado ao voltar

### 9.3 Meta Ads gera lead novo
1. Cron VPS a cada 2min chama `/api/poll-leads`
2. Endpoint faz poll da Meta Graph API pegando leads dos ads ativos
3. Leads novos são inseridos em `leads`
4. Sistema tenta distribuir: busca compradores com estado+interesse matching, saldo > 0, disponíveis
5. Round-robin designa lead a um comprador (decrementa `credits.total_used`)
6. Dispara notificações: email, WhatsApp direto + grupo admin, push (se instalado)

### 9.4 Comprador assina CRM Pro
1. `/dashboard/credits` → botão "Assinar $99/mês" ou "$950/ano"
2. Stripe Checkout em modo subscription
3. Webhook `customer.subscription.created` atualiza `buyers.crm_plan = 'pro'`
4. Se `referred_by` existe, gera `referral_rewards` para o indicador ($25 mo / $100 yr)
5. Acesso liberado a todas as features CRM Pro

### 9.5 Automação dispara
**Trigger instantâneo (stage_entered):**
1. User arrasta lead no pipeline
2. PATCH `/api/pipeline-leads/:id` atualiza stage_id
3. Fire-and-forget: chama `runAutomations([buyerId])`
4. Engine busca automations enabled com trigger_type=stage_entered + stage_id correspondente
5. Para cada lead no estágio, verifica idempotência, executa ação, grava em automation_runs

**Trigger temporal (stage_stale, no_response):**
1. Cron VPS a cada 30min chama `/api/cron/automations?secret=...`
2. Engine roda todas as automations de todos os buyers
3. Para triggers temporais, filtra leads que matcham o critério
4. Executa ações

### 9.6 Sequence processa passos
1. User enrolla lead via `/api/sequences/enroll`
2. Enrollment criado com `current_step=0, next_run_at=now+delay`
3. Cron VPS a cada 30min chama `/api/cron/sequences`
4. Engine busca enrollments `status=active` e `next_run_at <= now`
5. Executa o step atual, avança `current_step`, atualiza `next_run_at`
6. Quando acabam os steps, marca `status=completed`

### 9.7 Lead responde WhatsApp
1. Lead manda mensagem pro número do sistema
2. wa-bridge no VPS detecta via whatsapp-web.js
3. wa-bridge POSTa `/api/webhook/wa-bridge` com `wa_message_id, from, body`
4. Webhook valida apikey, busca lead por phone matching, grava em `whatsapp_messages`
5. Aba "Conversa" do lead mostra a nova mensagem (poll 10s)

### 9.8 AI Score calcula
1. User clica "Calcular Score" no lead
2. `POST /api/leads/:id/score` → `scoreLeadWithAI(leadId)`
3. Monta prompt com dados do lead + histórico de mensagens + follow-ups
4. Chama Claude Haiku API
5. Parse do JSON retornado → salva `ai_score`, `ai_score_reason`, `ai_scored_at` no lead
6. Badge atualiza na UI

---

## 10. Variáveis de Ambiente (Vercel Production)

### Obrigatórias
| Var | Valor/Descrição |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave anon Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave service role (admin) |
| `STRIPE_SECRET_KEY` | sk_live_... |
| `STRIPE_WEBHOOK_SECRET` | whsec_... |
| `RESEND_API_KEY` | re_... |
| `WA_BRIDGE_URL` | http://31.220.97.186:3457 (ou 3456) |
| `WA_BRIDGE_KEY` | leadflow-bridge-2026 |
| `META_APP_SECRET` | para Meta Graph API |
| `META_PAGE_TOKEN` | token da página Meta |
| `POLL_SECRET` | leadflow-poll-2026 (auth cron) |

### Features avançadas
| Var | Feature |
|---|---|
| `ANTHROPIC_API_KEY` | AI Lead Scoring |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push notifications (frontend) |
| `VAPID_PRIVATE_KEY` | Push notifications (backend) |
| `VAPID_SUBJECT` | mailto:noreply@lead4producers.com |

### Admin/notificação
| Var | Descrição |
|---|---|
| `WHATSAPP_ADMIN_GROUP` | ID do grupo WhatsApp de admin |
| `ADMIN_WHATSAPP` | Telefone direto do admin |

---

## 11. Como Operar o Sistema

### Admin do sistema (você)

**Atualizar preços:**
Editar `src/lib/stripe.ts` → array `PRODUCTS` → commit + push → auto-deploy.

**Adicionar novo admin:**
No Supabase SQL Editor:
```sql
UPDATE buyers SET is_admin = true WHERE email = 'usuario@email.com';
```

**Monitorar crons VPS:**
```bash
ssh root@31.220.97.186
tail -f /var/log/leadflow-auto.log
tail -f /var/log/leadflow-seq.log
tail -f /var/log/leadflow-poll.log
```

**Reiniciar wa-bridge:**
```bash
ssh root@31.220.97.186
pkill -f 'node /opt/wa-bridge/server.js'
cd /opt/wa-bridge && nohup node server.js > /var/log/wa-bridge.log 2>&1 &
```

**Verificar wa-bridge conectado:**
```bash
curl -H "apikey: leadflow-bridge-2026" http://31.220.97.186:3456/status
# Esperado: {"ready":true,"hasQR":false,"number":"17867442126"}
```

**Re-escanear QR do WhatsApp** (se desconectar):
```bash
ssh root@31.220.97.186
rm -rf /opt/wa-bridge/.wwebjs_auth
pkill -f 'node /opt/wa-bridge/server.js'
cd /opt/wa-bridge && nohup node server.js > /var/log/wa-bridge.log 2>&1 &
# Aguardar 30s
curl -H "apikey: leadflow-bridge-2026" http://31.220.97.186:3456/qr
# QR retorna como base64 PNG → abrir no browser pra escanear
```

### Time de TI — check de saúde

**1. Health check do app:**
```bash
curl https://lead4producers.com/api/health
```

**2. Health wa-bridge:**
```bash
curl -H "apikey: leadflow-bridge-2026" http://31.220.97.186:3456/status
```

**3. Supabase:** dashboard em https://supabase.com/dashboard

**4. Stripe:** dashboard em https://dashboard.stripe.com

**5. Logs Vercel:** dashboard em https://vercel.com/leandros-projects-4071f17d/leadflow

### Time de operação — KPIs para monitorar

| Métrica | Como medir | Bom |
|---|---|---|
| **Leads capturados/dia** | SELECT count(*) FROM leads WHERE created_at > now() - 1d | depende do ad spend |
| **Taxa distribuição** | leads.status='assigned' / total leads | >90% |
| **Taxa contato (5min)** | follow_ups em 5min após recebimento | >60% |
| **Taxa conversão** | leads.status='converted' / total | >15% para hot |
| **Churn CRM Pro** | cancelamentos / ativos no mês | <5%/mês |
| **ROI Meta Ads** | (leads vendidos × preço) / gasto em ads | >3x |

---

## 12. Troubleshooting Comum

### "WhatsApp não está enviando"
1. Check wa-bridge status (comando acima). Se `ready: false`, reescanear QR.
2. Check `/var/log/wa-bridge.log` por erros.
3. Verificar `WA_BRIDGE_URL` e `WA_BRIDGE_KEY` na Vercel env.

### "Leads não aparecem no sistema"
1. Check `/var/log/leadflow-poll.log` — cron está rodando?
2. Testar manualmente: `curl https://lead4producers.com/api/poll-leads?secret=leadflow-poll-2026`
3. Verificar Meta token não expirou (Meta tokens expiram a cada 60 dias).

### "Checkout falha"
1. Ver logs no Stripe dashboard em Events/Webhooks.
2. Verificar `STRIPE_WEBHOOK_SECRET` está correto (muda quando re-cria endpoint).

### "Push notification não chega"
1. User precisa ter aceitado no navegador (Permission: granted).
2. `push_subscriptions` tem registro do device?
3. VAPID keys na env são as mesmas que foram usadas pra registrar?

### "AI score não calcula"
1. `ANTHROPIC_API_KEY` tá configurada?
2. Tem crédito na conta Anthropic? (min $5)
3. Logs da Vercel mostram erro 4xx/5xx da API?

---

## 13. Roadmap Futuro (Sugestões)

### Curto prazo (semanas)
- **Multi-idioma (EN/ES)** — mercado hispânico duplica TAM
- **Lead import CSV** — agências migrando de outro CRM
- **Calendar sync** — Google Calendar / Calendly para agendamento automático de reuniões
- **Custom fields** — campos customizáveis por agência

### Médio prazo (meses)
- **Voice calls** — integração Twilio para click-to-call dentro do CRM
- **AI-generated responses** — sugestões de resposta baseadas no contexto
- **Multi-tenant wa-bridge** — cada agência com seu próprio WhatsApp
- **Reports PDF export** — relatórios mensais exportáveis para agências

### Longo prazo
- **API pública** — integrações Zapier/Make
- **Mobile app nativo** (React Native) — se PWA não for suficiente
- **Marketplace de integrações** — Salesforce, HubSpot, GoHighLevel
- **White-label** — agências grandes com próprio domínio

---

## 14. Contatos e Responsabilidades

| Área | Responsabilidade |
|---|---|
| **Operação do sistema** | Monitorar crons, wa-bridge, Stripe, Meta Ads |
| **Suporte ao cliente** | Responder dúvidas, troubleshoot, resetar senhas |
| **Vendas** | Onboarding de agências grandes, contratos custom |
| **Desenvolvimento** | Implementar novas features, corrigir bugs, deploys |
| **Marketing** | Ads (Meta, Google), conteúdo, SEO, emails |

---

**Documento gerado automaticamente a partir do código em produção.**
**Última atualização:** 2026-04-16
**Versão do sistema:** Migration 006 aplicada
