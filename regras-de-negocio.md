# Regras de Negócio — Lead4Producers (leadflow)

> **Fonte única de verdade das regras de negócio.** Dono: agente **Product Owner (PO)**.
> Quando uma regra muda, **muda aqui primeiro**; o código, as migrations e os settings
> devem refletir o que está escrito neste arquivo. Dev e Tester trabalham contra ele.
>
> **v1 — gerada em 2026-06-24** a partir de mapeamento do código + verificação manual.
> Os ponteiros `arquivo:linha` foram **conferidos contra o código em 2026-06-24**
> (deslocamentos corrigidos). Itens marcados **⚠ a confirmar** são pontos de
> **negócio/produto** que dependem de decisão humana — não ponteiros quebrados.

---

## 0. Como ler este documento

Cada regra segue o formato:

- **Enunciado** — a regra em linguagem de negócio.
- **Critérios de aceite** — condições verificáveis (viram testes).
- **Implementação** — onde mora hoje (`arquivo:linha` / migration / chave de settings).
- **Forçada por** — `banco` (constraint/trigger/função), `código`, `config` (settings no
  banco) ou `documentada` (só na doc, sem garantia técnica).

As regras estão **espalhadas em 4 camadas** (docs, código, config em `settings`, banco).
Esse espalhamento é o motivo deste arquivo existir: consolidar a intenção num lugar só.

---

## 1. Visão do produto

**O que é:** SaaS que combina **marketplace de leads** de seguro de vida + **CRM Kanban**
+ **automação de contato** (WhatsApp/Email) + IA de scoring.

**Público:** corretores de seguro de vida (foco em brasileiros nos EUA).

**Modelo de receita (⚠ confirmar valores):**
1. Venda de **leads por pacote** (one-time, via Stripe).
2. Assinatura **CRM Pro** (≈ USD 99/mês ou USD 950/ano).
3. Programa de **indicação (referral)** com recompensas em crédito.

---

## 2. Glossário de entidades

| Entidade | O que é |
|---|---|
| `buyers` | comprador/corretor (também pode ser **agência**) |
| `leads` | lead (origem Meta Ads ou import); tem estado, tipo (hot/cold), status |
| `credits` | saldo de leads/appointments comprados por um buyer |
| `buyer_states` | licenças do buyer por estado dos EUA (define onde pode receber lead) |
| `buyer_availability` | janelas de horário em que o buyer recebe lead/agenda |
| `appointments` | agendamentos |
| `payments` | pagamentos Stripe |
| `pipelines` / `pipeline_stages` / `pipeline_leads` | Kanban CRM |
| `follow_ups` | reuniões/tarefas de acompanhamento |
| `automations` / `automation_runs` | automações por trigger→ação |
| `sequences` / `sequence_steps` / `sequence_enrollments` | campanhas drip |
| `whatsapp_messages` / `client_messages` | inbox de mensagens |
| `team_members` | membros de uma agência |
| `referral_rewards` | recompensas de indicação |
| `settings` | configuração admin em JSON (ex.: `lead_routing`) |

---

## 3. Regras centrais (detalhadas)

### 3.1 Distribuição de leads — quem recebe o quê

#### R-DIST-01 · Distribuição padrão (por crédito + estado + horário)
- **Enunciado:** um lead vai para o comprador **elegível** com **mais créditos restantes**.
  Elegível = ativo, com crédito não-expirado, com **licença no estado** do lead e
  **disponível no horário** atual.
- **Critérios de aceite:**
  - buyer suspenso (`is_active=false`) nunca recebe lead.
  - buyer sem `buyer_states` para o estado do lead nunca recebe aquele lead.
  - entre elegíveis, vence o de maior crédito restante (desempate por compra mais antiga).
  - se ninguém está disponível agora mas existe buyer do estado, o lead aguarda até a
    carência (padrão **6h**) antes de cair no fallback.
- **Implementação:** `src/lib/distribute.ts:247` (lógica) + RPC `get_eligible_buyers`
  em `supabase/migrations/002_business_rules.sql:55`.
- **Forçada por:** código + banco.

#### R-DIST-02 · Round-robin para leads do Meta
- **Enunciado:** leads vindos do Meta (`meta_lead_id` preenchido) são alternados em
  rodízio entre uma lista de e-mails configurada.
- **Critérios de aceite:**
  - só se aplica a leads do Meta (não a imports).
  - respeita licença de estado; se ninguém do pool cobre o estado, cai na distribuição padrão (R-DIST-01).
  - escolhe o próximo e-mail após o último lead Meta atribuído.
  - **salvo R-DIST-08 ligado:** com `priority_only`, o rodízio fica suspenso e só os prioritários recebem.
- **Implementação:** `src/lib/distribute.ts:50` (`forceAssignRoundRobin`).
- **Forçada por:** código + config (`settings.lead_routing`).

#### R-DIST-03 · Regra do Administrador "1 a cada N" (proporcional)
- **Enunciado:** a cada **N** leads do sistema atribuídos, **1** vai para o(s) admin(s)
  em rodízio, com **prioridade** sobre o roteamento normal. É **proporcional ao volume**,
  não um teto diário fixo.
- **Critérios de aceite:**
  - `one_in=3` ⇒ 1 a cada 3 leads vai pro admin.
  - respeita licença de estado.
  - tem prioridade: roda **antes** dos outros modos de roteamento.
  - teto diário opcional em `admin_rule.daily_max` (vazio = sem limite; `0` = bloqueado até
    alterar); batido o teto, a vez é pulada (`adminDailyBlock` em `src/lib/admin-rule.ts:40`).
  - **salvo R-DIST-08 ligado:** a proporção "1 a cada N" fica suspensa (mas armazenada).
- **Implementação:** `src/lib/distribute.ts:122-179` (`interface AdminRule` em :122,
  `tryAdminRule` em :132) + `src/app/api/poll-leads/route.ts:149` + config `settings.lead_routing.admin_rule`
  (`{admin_emails, one_in, daily_quota, daily_max}`). Preview em `/api/admin/admin-rule-preview`.
- **Forçada por:** código + config. **Espalhada em 3 lugares** (ver Lacunas L-01).

#### R-DIST-04 · Modos de roteamento programado
- **Enunciado:** o roteamento global tem 5 modos, salvos em `settings.lead_routing`:
  `normal` (padrão), `exclusive` (tudo p/ 1 e-mail), `roundrobin` (rodízio num pool),
  `random` (sorteio no pool, depois filtra estado), `sequential` (X pro A, depois Y pro B).
- **Critérios de aceite:**
  - `sequential`: cada etapa tem `{email, limit, delivered}`; ao atingir `limit`, passa à próxima.
  - todos os modos respeitam licença de estado e podem ter fallback configurado.
  - a **regra do admin (R-DIST-03) tem prioridade** sobre qualquer modo.
- **Implementação:** `src/app/api/poll-leads/route.ts:13-48` +
  `src/app/admin/settings/lead-routing-card.tsx`.
- **Forçada por:** código + config.

#### R-DIST-05 · Fallback 24/7 (comprador padrão)
- **Enunciado:** se nenhum buyer elegível existir e a carência tiver passado, o lead vai
  para o `fallback_email` configurado (garante que nada fica preso).
- **Critérios de aceite:**
  - fallback nulo/inativo ⇒ lead fica **pendente** e o grupo é notificado.
  - só aciona depois da carência (R-DIST-01).
  - **salvo R-DIST-08 ligado:** não há fallback; o lead automático permanece pendente.
- **Implementação:** `src/lib/distribute.ts:222` + `settings.lead_routing.fallback_email`.
- **Forçada por:** código + config.

#### R-DIST-06 · Redistribuição de pendentes (cron)
- **Enunciado:** leads `status='new'` e `assigned_to=null` criados nos últimos **7 dias**
  (`maxAgeHours = 168`) são reprocessados periodicamente (poll a cada ~2min) quando janelas
  de buyers abrem.
- **Critérios de aceite:** respeita o modo de roteamento vigente; re-tenta atribuir.
- **Implementação:** `src/lib/distribute.ts:391` + `src/app/api/poll-leads/route.ts`.
- **Forçada por:** código.

#### R-DIST-07 · Distribuição interna em agência
- **Enunciado:** se o buyer é agência (`is_agency=true`) e `team_distribution_mode='auto_roundrobin'`,
  o lead atribuído à agência é repassado a um **membro** em rodízio (o com menos leads).
- **Critérios de aceite:** membro escolhido é notificado; só ocorre em buyer-agência.
- **Implementação:** `src/lib/distribute.ts:376` + migration `003_team_agency.sql`.
- **Forçada por:** código + banco.

#### R-DIST-08 · Entrega exclusiva aos prioritários (priority_only)
- **Enunciado:** com `settings.lead_routing.priority_only = true`, os leads **automáticos do
  Meta** (`meta_lead_id`, PT e ES) só são entregues aos compradores listados em
  `admin_rule.admin_emails`. A proporção "1 a cada N" fica suspensa (mas armazenada) e
  **não existe fallback**: sem prioritário elegível, o lead fica pendente. Flag ausente ou
  `false` = desligado.
- **Critérios de aceite:**
  - aplica-se apenas a leads automáticos do Meta, nos idiomas PT e ES.
  - só compradores em `admin_rule.admin_emails` podem receber; nenhum outro comprador recebe.
  - funcionário (staff) também consome crédito líquido do idioma — a exceção gratuita de
    R-DIST-03 vale **somente** com o switch desligado.
  - licença por estado, janela de disponibilidade e teto diário (`daily_max`) continuam
    valendo; lead sem estado fica pendente (não infere estado).
  - sem elegível, o lead permanece pendente com o motivo registrado; nenhum fallback
    (R-DIST-05 não aciona).
  - leads manuais, importados e agendamentos não mudam.
  - desligado, tudo volta ao comportamento anterior, inclusive a exceção gratuita de funcionário.
  - o switch é alterado por `PATCH /api/admin/priority-only` (sessão + `is_admin`), com
    compare-and-swap JSONB: um snapshot antigo não reverte o switch.
  - leads pendentes são retentados pelo cron por até 7 dias (`maxAgeHours = 168`, R-DIST-06);
    mais antigos exigem `/api/admin/redistribute`.
- **Implementação:** `src/lib/distribute.ts` (`tryPriorityOnly` + guarda em
  `forceAssignRoundRobin`, `tryAdminRule` e `distributeLeadToNextBuyer`) +
  `src/app/api/admin/priority-only/route.ts` +
  `supabase/migrations/049_priority_only_atomic_delivery.sql` +
  testes `tests/priority-only*.test.ts`. UI: `src/app/admin/settings/lead-routing-card.tsx`
  (switch) + `src/components/admin/delivery-queue-card.tsx` (fila).
- **Forçada por:** código + config (`settings.lead_routing.priority_only`) + banco (RPCs da 049).

### 3.2 Créditos, cotas e pacotes

#### R-CRED-01 · Cota = créditos (sem teto diário)
- **Enunciado:** não há limite diário fixo por buyer. A "cota" é o saldo de **créditos**
  comprados; cada lead atribuído consome 1 crédito.
- **Critérios de aceite:**
  - elegível só com `remaining > 0` e crédito não expirado.
  - ao atribuir, `total_used` incrementa.
  - créditos de `lead` e `appointment` são **separados**.
- **Implementação:** RPC `get_eligible_buyers` (`002_business_rules.sql:55`) +
  `credits` em `001_initial_schema.sql:30` + `src/app/api/webhook/stripe/route.ts`.
- **Forçada por:** banco + código.

#### R-CRED-02 · Expiração de créditos
- **Enunciado:** crédito com `expires_at` no passado deixa de contar.
- **Critérios de aceite:** `get_eligible_buyers` filtra `expires_at IS NULL OR > now()`.
  **⚠** não há job que "limpe"/avise créditos expirando (só checagem em tempo de uso).
- **Implementação:** `credits.expires_at` (`001_initial_schema.sql:39`).
- **Forçada por:** banco.

#### R-CRED-03 · Pacotes e oferta de primeira compra (Starter)
- **Enunciado:** pacotes: Starter (1ª compra), Lead (100/500/1000), Appointment, Cold_Lead.
  O Starter só aparece para quem **nunca comprou**.
- **Critérios de aceite:** `hasPurchased=true` ⇒ Starter some da vitrine.
- **Implementação:** `src/app/dashboard/credits/page.tsx` + `STARTER_PACKAGE_ID`.
- **Forçada por:** código.

#### R-CRED-04 · Cold leads — compra só registra pagamento (entrega manual)
- **Enunciado:** ao comprar pacote `cold_lead`, a compra **só registra o pagamento**: não
  gera crédito e não auto-atribui nem entra na fila. A entrega é **manual** (planilha) pelo
  admin. Lead quente e demais produtos seguem gerando crédito normalmente.
- **Critérios de aceite:** o webhook Stripe **não** chama `distributeColdLeads`;
  `distributeColdLeads` (`src/lib/cold-leads.ts:33`) é rotina legada **sem caller** no código.
- **Implementação:** `src/app/api/webhook/stripe/route.ts:94` (`isColdLead`) +
  `src/lib/cold-leads.ts` (legado).
- **Forçada por:** código.

### 3.3 Licença estadual e disponibilidade

#### R-LIC-01 · Licença por estado
- **Enunciado:** buyer só recebe lead de um estado se tiver registro em `buyer_states`
  para aquele `state_code`.
- **Critérios de aceite:** `UNIQUE(buyer_id, state_code)`; vale para distribuição padrão,
  round-robin e regra do admin. Lead sem estado = não filtra.
- **Implementação:** `002_business_rules.sql:9` + `src/lib/distribute.ts:84`.
- **Forçada por:** banco + código.

#### R-LIC-02 · Disponibilidade por horário/fuso
- **Enunciado:** `buyer_availability` define quando o buyer recebe lead; sem config = 24/7.
  O fuso é derivado dos estados do buyer.
- **Critérios de aceite:** `isAvailableNow()` decide; fora da janela, aguarda até a carência.
- **Implementação:** `buyer_availability` (`002_business_rules.sql:32`) + `src/lib/availability.ts`.
- **Forçada por:** banco + código.

#### R-LIC-03 · Horário oficial do sistema = Flórida (America/New_York)
- **Enunciado:** todo horário exibido ou enviado pelo sistema (dashboard, admin, mobile,
  lembretes, e-mails, mensagens de confirmação) é o horário oficial da Flórida (costa leste,
  `America/New_York`, EST/EDT com horário de verão automático), independente do fuso do
  navegador ou do servidor (Vercel = UTC). O horário em que o cliente recebeu o lead no
  WhatsApp (`notified_at`) é exibido como "Entregue no WhatsApp" e tem que bater com o
  horário da mensagem no celular dele; sem `notified_at`, mostra a atribuição no CRM
  (`assigned_at`). Datas/horas digitadas em formulários de agenda são interpretadas como
  horário da Flórida antes de gravar, e a interface deixa o fuso explícito (aviso no topo
  de cada shell + rótulo nos campos de hora).
- **Critérios de aceite:** navegador em Brasília cria compromisso às 10:00 → agenda mostra
  10:00 (não 09:00/11:00); abrir e salvar sem editar não muda o horário; eventos 23:00-23:59
  ET aparecem na visão do dia; KPIs "hoje" viram à meia-noite da Flórida; textos de
  lembrete/confirmação trazem "(ET)" ou "(horário da Flórida)". Timestamps gravados no banco
  não são reescritos; cron/disponibilidade/distribuição não mudam.
- **Implementação:** `src/lib/florida-time.ts` (`formatFloridaDateTime`, `floridaParts`,
  `floridaWallClockToISO`, `floridaDayRange`), `src/components/florida-time-notice.tsx`,
  `docs/features/florida-time.md`; testes `tests/florida-time.test.ts`,
  `tests/florida-display.test.ts`, `tests/florida-display.cjs`.
- **Forçada por:** código (testes rodam com `TZ=UTC` e `TZ=America/Sao_Paulo`).

### 3.4 Tiers e acesso ao CRM

#### R-TIER-01 · Quem tem acesso ao CRM
- **Enunciado:** tem acesso ao CRM quem é **admin**, tem `crm_plan='pro'`, **ou** está em
  **trial válido**.
- **Critérios de aceite:** `hasCrmAccess() = is_admin || crm_plan==='pro' || trial_ends_at>now()`.
- **Implementação:** `src/lib/crm-access.ts:9`.
- **Forçada por:** código.

#### R-TIER-02 · Tiers especiais (appointment-only / lead-only)
- **Enunciado:** `crm_plan='appointment'` (comprou agenda, não assinou CRM) libera só
  agenda/créditos/settings; `crm_plan='lead_only'` libera só leads/créditos/settings; o
  resto fica atrás de upsell. Admin e trial/pro **nunca** são appointment-only.
- **Critérios de aceite:** rotas liberadas conforme o tier; **⚠** se appointment-only
  assina o Pro, o `crm_plan` não migra automático (depende do webhook) — ver L-07.
- **Implementação:** `src/lib/crm-access.ts:22` + `src/app/api/webhook/stripe/route.ts`.
- **Forçada por:** código.

#### R-TIER-03 · Admin vê tudo
- **Enunciado:** `is_admin=true` vê **todos** os leads; não-admin vê só os seus
  (`assigned_to = buyer.id`).
- **Critérios de aceite:** policies usam a função `is_admin()` (SECURITY DEFINER) para
  evitar recursão de RLS.
- **Implementação:** `src/lib/crm-access.ts:11` + `016_fix_rls_recursion.sql:18`.
- **Forçada por:** código + banco.

### 3.5 Trial de 7 dias

#### R-TRIAL-01 · Trial automático no cadastro
- **Enunciado:** todo buyer novo ganha `trial_ends_at = now() + 7 dias`, com acesso CRM Pro
  no período. Vence sozinho.
- **Critérios de aceite:** durante o trial, `hasCrmAccess()=true`; depois, volta a depender
  de `pro`. **⚠** não há e-mail de "trial acabando".
- **Implementação:** `src/app/api/auth/register/route.ts:62` + `crm-access.ts:13` +
  `010_trial_7d.sql`.
- **Forçada por:** código + banco.

### 3.6 Billing / Stripe

#### R-BILL-01 · Compra de créditos (checkout → webhook)
- **Enunciado:** o webhook `checkout.session.completed` cria os `credits` com a metadata
  do pacote.
- **Critérios de aceite:** registra `buyer_id, product_type, quantity, price_per_unit, stripe_payment_id`;
  `cold_lead` só registra o pagamento, sem crédito nem distribuição (R-CRED-04).
- **Implementação:** `src/app/api/webhook/stripe/route.ts`.
- **Forçada por:** código.

#### R-BILL-02 · Assinatura CRM Pro (ciclo de vida)
- **Enunciado:** `subscription.created` ⇒ `crm_plan='pro'`; `subscription.deleted` ⇒ `crm_plan='free'`.
  Intervalo de cobrança mensal ou anual (`crm_billing_interval`).
- **Critérios de aceite:** plano reflete o estado da assinatura no Stripe.
- **Implementação:** `src/app/api/webhook/stripe/route.ts` + `005_features_pack.sql:7`.
- **Forçada por:** código + banco.

---

## 4. Regras de apoio (inventário)

Mesmo formato resumido — `Enunciado curto` · `onde` · `forçada por`.

### CRM / Kanban
- **Pipeline padrão no cadastro:** novo buyer ganha pipeline "Vendas" `is_default` com stages padrão · `distribute.ts:28` + `register/route.ts:107` · código.
- **Lead ↔ pipeline ↔ stage:** `UNIQUE(lead_id, pipeline_id)`; lead pode estar em vários pipelines · `004_kanban_crm.sql:25` · banco.
- **Follow-up status:** `pending|completed|no_show` · `013_followup_status.sql:3` · banco.
- **Tags:** `UNIQUE(buyer_id, name)`; lead_tags N:N · `005_features_pack.sql:12` · banco.

### Automações
- **Triggers:** `stage_entered | stage_stale | no_response | meeting_before` · `005_features_pack.sql:51` / `012_automation_meeting_trigger.sql` · banco.
- **Ações:** `send_template | move_stage | notify_agent` · `005_features_pack.sql:53` · banco.
- **Idempotência:** `UNIQUE(automation_id, lead_id[, meeting_id])` evita rodar 2x · `005/012` · banco.
- **meeting_before:** dispara N horas antes de appointment/calendar/follow-up · `012_automation_meeting_trigger.sql` · banco.

### Sequências (drip)
- **Disparo por estágio:** `trigger_stage_id` opcional · `006_*.sql:44` · banco.
- **Tipos de passo:** `send_template | wait | notify_agent` · `006_*.sql:56` · banco.
- **Status de enrollment:** `active | completed | paused | stopped` · `006_*.sql:68` · banco.

### WhatsApp / inbox
- **Multi-bridge por buyer:** cada buyer tem `wa_bridge_*` próprio · `011_multi_wa_bridge.sql` · banco.
- **Sync de owner ao reatribuir:** trigger atualiza `buyer_id` de todas as msgs do lead · `018_wa_owner_sync.sql:14` · banco (trigger).
- **Direção/status da msg:** `in|out` / `sent|delivered|read|failed` · `006_*.sql` · banco.

### Notificações / reminders / push
- **Intervalos de lembrete:** default `{60,15,5}` min antes · `015_notification_preferences.sql:7` · banco.
- **Canais:** `push | whatsapp | email | banner` · `015_*.sql:41` · banco.
- **Idempotência de reminder:** `UNIQUE(event_type, event_id, interval, channel)` · `015_*.sql:43` · banco.
- **Push endpoint único:** `UNIQUE endpoint` · `006_*.sql:112` · banco.
- **Notificação de atribuição:** ao atribuir, notifica buyer + grupo; falha não bloqueia; watchdog reenvia se `notified_at` nulo · `distribute.ts:19` + `020_notified_at.sql` · código + banco.

### Referral
- **Código único:** `UNIQUE referral_code` (8 chars) · `005_features_pack.sql:90` · banco.
- **Eventos de recompensa:** `signup | first_purchase | crm_subscription` · `005_*.sql:98` · banco.
- **1 recompensa por tipo:** `UNIQUE(referred_buyer_id, trigger_event)` · `005_*` · banco. **⚠** sem trava de auto-indicação.

### SMS (Twilio)
- **Campanha:** `draft | sending | done` · `017_sms.sql:13` · banco.
- **Opt-out:** `sms_opted_out` no lead · `017_sms.sql:37` · banco.

### Ciclo de vida do lead
- **Tipo:** `hot | cold` · `001_initial_schema.sql:58` · banco.
- **Status:** `new | assigned | qualified | appointment_set` · `001:59` · banco.
- **Atividade:** `contacted | no_answer | callback | meeting_set | converted | lost` · `001:89` · banco.
- **Appointment:** `scheduled | confirmed | completed | no_show | cancelled` · `001:76` · banco.
- **Meta lead único:** `UNIQUE meta_lead_id` evita import duplicado · `001:48` · banco.
- **Arquivamento (soft delete):** `archived/archived_at/archived_by` · `011_archive_leads.sql` · banco.
- **AI score 0-100:** `CHECK 0..100` · `006_*.sql:100` · banco.

---

## 5. Lacunas e pontos em aberto (backlog do PO)

Itens onde a regra está incompleta, espalhada, ou só documentada. **São as perguntas que
o PO precisa resolver** antes de Dev/Tester mexerem.

- **L-01 · Regra do admin espalhada:** vive em `distribute.ts`, em `poll-leads/route.ts` e
  no `settings` + endpoint de preview. Consolidar num serviço/RPC único.
- **L-02 · ~~Sem teto real no admin~~ resolvido:** existe cap diário em `admin_rule.daily_max`
  (`src/lib/admin-rule.ts:5,40` + UI "Máximo de … por dia"); vazio = sem limite, `0` = bloqueado.
- **L-03 · Tabela `templates` ausente:** automações/sequências referenciam `template_id`
  mas nenhuma migration cria `templates`. Confirmar onde vive.
- **L-04 · Origem de `crm_plan`/`crm_billing_interval`:** colunas usadas mas a migration de
  origem precisa ser confirmada (o mapeamento citou `014_crm_plan` que **não existe** com
  esse nome — as migrations 014 são outras). **⚠ a confirmar.**
- **L-05 · Expiração de crédito sem job:** nada marca/avisa crédito expirando; só checa no uso.
- **L-06 · Trial sem aviso:** vence em silêncio, sem e-mail de "acaba amanhã".
- **L-07 · Re-upgrade de tier:** appointment-only que assina Pro pode não migrar `crm_plan` automático.
- **L-08 · `notified_at` e retry:** se a notificação falha sem setar `notified_at`, o watchdog
  pode reenviar em loop. Definir limite de tentativas.
- **L-09 · Disponibilidade vs agendamento:** `buyer_availability` define slots, mas nada
  garante que um agendamento respeite o slot (regra definida, não forçada).
- **L-10 · RLS frouxa em alguns pontos:** `sms_campaigns`, `client_messages`, `credits`,
  `lead_activity` — revisar policies de leitura/admin.
- **L-11 · Ambiguidades de doc:** seleção de cold leads, priorização do scoring batch,
  matching de telefone, múltiplas ações em automação — descritos vagamente. Precisam de critério.

---

## 6. Como manter este documento (processo do PO)

1. **Toda mudança de regra começa aqui** — edite o enunciado e os critérios de aceite.
2. **Aponte a implementação** — sempre que possível, o `arquivo:linha`/migration/setting.
3. **Marque o status** — `⚠ a confirmar` enquanto não validado no código.
4. **Lacunas viram histórias** — cada item da seção 5 é candidato a entrar no ciclo
   PO → Dev → Tester.
5. **Versione junto do código** — este arquivo vive no repo `leadflow`, então acompanha
   as mudanças e o histórico do git.
