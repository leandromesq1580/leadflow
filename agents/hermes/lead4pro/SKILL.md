---
name: lead4pro
description: "Diagnóstico e operação do Lead4Pro (LeadFlow) e demais sistemas do Leandro nos dois VPS. Use para: status de servidor, containers/serviços, logs, erros de produção, WhatsApp fora do ar, leads que pararam de entrar."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
metadata:
  hermes:
    tags: [lead4pro, leadflow, whatsapp, vps, docker, systemd, producao, diagnostico]
prerequisites:
  commands: [ssh]
---

# Lead4Pro — operação e diagnóstico

## ⚠️ O erro mais comum: procurar Docker no servidor errado

**O VPS-1 NÃO TEM DOCKER.** Nenhum container, nenhum compose, nenhuma image.
Se o usuário pedir "quais containers estão rodando", no VPS-1 isso significa
**serviços systemd**. `docker ps` ali retorna `command not found`.

## Arquitetura real (verificada em 09/09/2026)

Lead4Pro é híbrido, em três camadas — só uma delas é acessível por SSH:

| Camada | Onde | Acesso |
|---|---|---|
| Web + API (Next.js) | **Vercel**, serverless | API da Vercel — sem SSH |
| Banco de dados | **Supabase**, gerenciado | API/Postgres remoto — sem SSH |
| WhatsApp (wa-bridge) | **VPS-1**, systemd | SSH ✅ |
| Chatbot | **VPS-2**, Docker | SSH ✅ |

Consequência: "por que os leads pararam de entrar?" quase nunca se responde
só por SSH. O caminho do lead é Meta → Vercel (API) → Supabase → wa-bridge.
O SSH só enxerga o último trecho.

## Os dois servidores

### VPS-1 — `62.146.229.13` (alias `lead4pro-prod`)
12 CPU · 47 GB RAM · 193 GB · Ubuntu 24.04 · **saturado**

Sistemas que moram aqui:
- **Lead4Pro wa-bridge** — 58 instâncias `wa-bridge@<cliente>.service`,
  mais `wa-bridge-admin` (:3458, autoridade de portas) e `wa-bridge-watchdog.timer`.
  Dados das sessões em `/opt/wa-bridge-data` (~1,6 GB por cliente).
- **DeedWise** (Tax Deed) — `admin|analysis|api|research.deedwise.us` → :3030, :3333, :3334
- **Carvero** — `carvero.jarvis4you.app` → :4174
- **Criativos** — :5443 → :5599 · **Crystal backend** · **Oura agent**
- **Postgres local** (`wdt_dashboard`) — é do Tax Deed, **não** do Lead4Pro

### VPS-2 — `13.140.34.199` (root, chave padrão)
8 CPU · 23 GB RAM · 290 GB · Docker 29.1.3 · **com folga**

- **ChatbotX** — `chatbot.lead4producers.com`, 10 containers, projeto compose `chatbotx`
  em `/opt/chatbotx`. Proxy é **Caddy** (TLS automático), não nginx.

## Acesso

```bash
ssh lead4pro-prod            # conta hermes, SEM sudo, só leitura — use esta
ssh root@62.146.229.13       # chave pessoal do Leandro, poder total
ssh root@13.140.34.199       # VPS-2
```

A conta `hermes` está no grupo `systemd-journal`: lê logs e status de tudo,
mas **não** para serviço, **não** escreve em `/opt`, **não** lê `/etc/wa-bridge/*.env`.
Se um comando falhar com `Permission denied` ou `Interactive authentication required`,
é a barreira funcionando — não tente contornar; peça autorização ao Leandro.

## Diagnóstico rápido

```bash
# Visão geral do VPS-1
ssh lead4pro-prod 'systemctl list-units "wa-bridge@*" --state=running --no-legend | wc -l'
ssh lead4pro-prod 'systemctl list-units "wa-bridge@*" --state=failed --no-legend'
ssh lead4pro-prod 'free -h; df -h /; uptime'

# Um cliente específico
ssh lead4pro-prod 'systemctl status wa-bridge@<cliente> --no-pager | head -8'
ssh lead4pro-prod 'journalctl -u wa-bridge@<cliente> -n 40 --no-pager -o cat'
ssh lead4pro-prod 'tail -40 /var/log/wa-bridge-<cliente>.log'

# VPS-2
ssh root@13.140.34.199 'docker ps --format "table {{.Names}}\t{{.Status}}"'
ssh root@13.140.34.199 'docker logs --tail 50 chatbotx-builder-1'
```

## Problemas conhecidos e como reconhecê-los

### Memória estourada (a causa nº 1 de cliente fora do ar)
Cada cliente = 1 Chrome ≈ **1 GB de RAM** + 1,6 GB de disco. 58 clientes pedem
~58 GB; o servidor tem 47. Quando lota, o kernel mata o Chrome de um cliente e
**o WhatsApp dele cai em silêncio**.

```bash
ssh lead4pro-prod 'free -h'                       # swap 39/39 = saturado
ssh root@62.146.229.13 'dmesg -T | grep oom-kill:' # quem foi morto
```
Os Chromes têm `oom_score_adj=300` de propósito (vítima preferencial); nginx,
Postgres e wa-bridge-admin têm `-900` (blindados). Isso é intencional.

**`CHROME_LEAN=1` já está nas 58 instâncias** — não sugira "aplicar CHROME_LEAN",
já está feito e não é suficiente. A solução real é mais RAM.

### ⚠️ ARMADILHA: o canal comercial NÃO é `wa-bridge@regiane`
O serviço **`wa-bridge.service`** (sem `@`, o "principal") carrega
`EnvironmentFile=/etc/wa-bridge/regiane.env` e ocupa a porta **3466** — ou seja,
**ele É o canal comercial da regiane (8696)**. A instância `wa-bridge@regiane`
existe mas fica `disabled` de propósito.

**NUNCA rode `systemctl enable --now wa-bridge@regiane`.** Isso sobe um segundo
processo para o mesmo cliente, que morre com `EADDRINUSE ... 0.0.0.0:3466` e deixa
uma unit em estado `failed`. (Erro cometido em 09/09/2026.) Para conferir o canal
comercial use `systemctl status wa-bridge` e `tail /var/log/wa-bridge.log`.

Se o log mostrar `[regiane][QR] Generated` repetidamente, a sessão do WhatsApp
expirou e **alguém precisa reescanear o QR com o aparelho do número** — não há
conserto por SSH.

### Canal de AVISOS caiu / "sumiram as notificações" (27/09/2026)
Os avisos de lead (comprador, grupo admin e os próprios alarmes) saem por **`wa-bridge@piroli`**
(786-744-2126, porta **3456**; o nginx na **3457** aponta pra ele — é o default do app).
```bash
ssh lead4pro-prod 'K=$(grep ^API_KEY= /etc/wa-bridge/piroli.env|cut -d= -f2); curl -s -H "apikey: $K" http://127.0.0.1:3456/status'
ssh lead4pro-prod 'grep -aE "DISCONNECTED|READY|AUTH" /var/log/wa-bridge-piroli.log | tail'
```
`{"ready":false,"hasQR":true}` = deslogado; `DISCONNECTED LOGOUT` = o WhatsApp derrubou a sessão.
**Não há conserto por SSH** — alguém escaneia o QR com o celular 786-744-2126. O QR morre em ~40 s
e o bridge só renova a cada 10 min: antes do scan, `curl -X POST -H "apikey: $K" http://127.0.0.1:3456/restart`
(mesma ação do botão do app) e o scan em até 40 s. Diga isso ao Leandro em vez de "falta acesso".
Enquanto cai: os avisos saem pela **bridge reserva** (conta `is_admin` com bridge `ready`, ex.
863-280-8696), o alarme chega por WhatsApp/e-mail/SMS, e o `poll-leads` reenvia por 72 h o que ficou
`notified_at IS NULL`. Contar o buraco:
`l4p-sql "select count(*) from leads where assigned_at > now()-interval '3 days' and notified_at is null and meta_lead_id is not null"`.
Reenvio manual: `POST https://lead4producers.com/api/admin/resend-notifications?secret=<POLL_SECRET>`
com `{"lead_ids":[...]}` em lotes de 3 (reenvia e-mail também).

### Alarme que mente
`chatbotx-builder-1` aparecia `unhealthy` com milhares de falhas porque o
healthcheck chamava `curl`, que não existe na imagem — e apontava para
`localhost`, que não responde (só o hostname `builder` responde). O serviço
estava saudável o tempo todo. **Antes de reportar um serviço como quebrado,
teste o endpoint você mesmo.**

### Força bruta de SSH
`fail2ban` ativo no VPS-1 desde 09/09/2026, jail `sshd`, ban de 1h.
O IP do Leandro (`96.59.186.116`) está na lista de ignorados.
```bash
ssh root@62.146.229.13 'fail2ban-client status sshd'
```

## Política de autonomia — obedeça sempre

**VERDE — pode fazer sozinho.** Ler status, logs, CPU/RAM/disco, health checks,
Git, código; investigar erros; consultas somente-leitura; testar endpoints
não destrutivos.

**AMARELO — pare e peça autorização ao Leandro.** Alterar código, commit, push,
PR, restart de serviço/container, deploy, rollback, mudar configuração ou `.env`,
migration, qualquer escrita no banco de produção.

**VERMELHO — nunca execute.** `DROP DATABASE`, DELETE em massa, `docker volume rm`,
`docker system prune`, apagar dados/servidor, revelar secrets ou chaves privadas.

Regras adicionais:
- **Nunca imprima o conteúdo de `/etc/wa-bridge/*.env`, `.env` ou `DATABASE_URL`.**
  Ao filtrar variáveis, lembre que a URL do Postgres começa com `postgresql://`
  (com "ql"), não só `postgres://` — filtre os dois.
- **Nunca declare "está funcionando" sem colar a saída real do comando.**
  Se não verificou, escreva "NÃO VERIFICADO" e liste o que falta.
- **Antes de sugerir correção, reproduza o erro** e mostre a evidência crua.
- Faça backup antes de editar qualquer arquivo de produção.

## Código — cópia de trabalho e fluxo de mudança

Repositório: `github.com/leandromesq1580/leadflow` (produção = branch `main`, executada
pela **Vercel**; o deploy NÃO é automático — veja abaixo).

**Cópia de trabalho do agente: `~/DEV-APPS/leadflow-agent`** (clone limpo, Node 20.9,
Next 16.2.3). Não use `/tmp/lf*` (some no reboot) nem `~/Documents/leadflow` (centenas
de commits atrás). Antes de qualquer análise: `git -C ~/DEV-APPS/leadflow-agent checkout main && git -C ~/DEV-APPS/leadflow-agent pull --ff-only`.
⚠️ **Produção = `main`.** Em 24–27/09/2026 dois lados publicaram de branches divergentes e cada
deploy apagou o trabalho do outro. Antes de QUALQUER deploy: `git rev-list --count HEAD..origin/main`
tem que dar 0 — senão não publique. (Seu WIP de 15/09 em `fix/buyer-lead-language` está em `git stash`.)

⚠️ Next 16 tem mudanças incompatíveis com versões anteriores — antes de escrever código,
leia o guia relevante em `node_modules/next/dist/docs/` (regra do próprio repositório).

### Fluxo obrigatório para correção, alteração ou coisa nova
1. `git pull --ff-only` na `main`; criar branch `fix/<assunto>` ou `feat/<assunto>`.
2. Reproduzir o problema (log, teste falhando, endpoint) e mostrar a evidência **antes** de editar.
3. Editar. Rodar `npm run lint` e `npm test`; para mudança em página/API, `npm run build`.
   Colar a saída real. Teste que não rodou = "NÃO VERIFICADO".
4. Commit com mensagem em PT-BR no padrão do repositório (`fix(escopo): ...`, `feat(...)`).
5. `git push -u origin <branch>` e `gh pr create --fill --base main`. **Push direto na `main`: nunca.**
6. **Deploy só com autorização explícita do Leandro**, depois do PR MESCLADO na `main`:
   `git checkout main && git pull --ff-only`, conferir `git rev-list --count HEAD..origin/main` = 0,
   então `l4p-vercel deploy --prod --yes`. Nunca de uma branch `fix/*`/`feat/*`. Confirmar com
   `curl -sI https://lead4producers.com` (`server: Vercel`) e conferir o `x-vercel-id` mudou.
   Reportar o que foi verificado e o que não foi.
7. Migration de banco: escrever o SQL no PR (`supabase/migrations/`) e **pedir ao Leandro**
   — a role do agente é somente-leitura por desenho.

### Baseline da `main` em 27/09/2026 — não culpe sua mudança por isso
- `npm test` (`tsx --test tests/*.test.ts`): **208 testes, 1 falha conhecida** —
  `tests/automation-scheduling.test.ts` ("lead distribution triggers automations…", regex de
  texto-fonte sem `as any`). Se só essa falhar, está no baseline. As suítes `.cjs` rodam à parte
  (`node --test tests/<nome>.test.cjs`); `sales-team-pricing.test.cjs` tem 5 falhas de loader
  pré-existentes (`./i18n`). Se um teste NOVO falhar, a culpa é da mudança.
- `npm run lint` na `main` intocada dá **898 erros** — inútil como portão. Lint **só
  nos arquivos alterados**: `npx eslint $(git diff --name-only main -- '*.ts' '*.tsx')`.
- `npm run build` passa em ~1 min e termina com a lista de rotas; conferir com
  `cat .next/BUILD_ID`. Exit code no zsh pode aparecer vazio — olhe a saída, não o `$?`.
- `.env.local` da cópia é ignorado pelo git (`git check-ignore`), nunca vai no commit.

Amarelo (pede autorização): editar código, commit, push, PR, deploy, rollback, `.env`, migration.
Verde: ler, analisar, reproduzir, rodar teste e build localmente.

## Banco de dados (Supabase) — como consultar

Use SEMPRE o wrapper, nunca `psql` direto nem a REST do Supabase:

```bash
/home/hermes/.hermes/profiles/lead4pro/bin/l4p-sql "select count(*) from leads"
```

> ⚠️ **Sempre o caminho ABSOLUTO acima.** Com `~/...` o scanner de segurança do Hermes
> (Tirith) não resolve o executável e bloqueia com "Nested executable body could not be
> resolved". Isso custou três tentativas em 09/09/2026.

Ele conecta com a role `hermes_readonly` (só SELECT) e força a sessão em somente-leitura.
Se responder `SEM ACESSO`, o banco ainda não foi ligado ao agente — diga isso e pare.
**Nunca abra o painel no navegador nem peça login para "olhar o número".**

### Semântica real (aprendida a custo — não adivinhe colunas)
- **Lead do sistema** = `meta_lead_id IS NOT NULL`. Lead manual/importado/indicação
  **não conta** em métrica nenhuma (regra financeira do Leandro).
- **Entregue** = `assigned_to IS NOT NULL`; a data da entrega é `assigned_at`
  (`delivered_at` também existe — confirme qual o Leandro quer antes de comparar períodos).
- **Fonte/origem** = `campaign_name` (ex.: "Meta Lead Ads", "Manual", "INDICAÇÃO").
  **Não existe** coluna `source`. Não existe `price_paid` — valor é `policy_value`.
- **Conversão** = estágio do pipeline (`pipeline_leads` → `pipeline_stages.name` ~ "Fechado/Ganho"),
  não o checkbox `contract_closed`. `pipeline_leads` não tem `buyer_id`.
- **Leads pagos/devidos** = contadores de crédito (`total_purchased − total_used`), NUNCA
  recontando a tabela `leads` (senão lead manual entra).
- **Fuso**: o negócio é na Flórida. "Hoje/ontem" = `America/New_York`:
  `(assigned_at AT TIME ZONE 'America/New_York')::date = (now() AT TIME ZONE 'America/New_York')::date - 1`.
- Antes da primeira consulta numa tabela, confira as colunas:
  `select column_name from information_schema.columns where table_name='leads' order by 1`.

### Perguntas típicas
- Entregues ontem: `select count(*) from leads where meta_lead_id is not null and assigned_to is not null and (assigned_at at time zone 'America/New_York')::date = (now() at time zone 'America/New_York')::date - 1`
- Por origem na semana: `select campaign_name, count(*) from leads where created_at >= now() - interval '7 days' group by 1 order by 2 desc`
- Duplicados: agrupe pela coluna de telefone (confirme o nome em information_schema) com `having count(*) > 1`.
- Semana × semana anterior: duas CTEs com `date_trunc('week', ...)` no fuso de NY.

Ao responder, traga o número **e** a consulta que o gerou (uma linha), para o Leandro
poder conferir. Se o resultado parecer estranho, rode uma segunda consulta por outro
caminho antes de reportar.

## Regras de negócio que mudaram em setembro/2026 (fonte: `docs/features/`)
- **Preço de lead** vem de `/admin/precos` → `settings.lead_pricing` (`src/lib/lead-pricing.ts`);
  `PRODUCTS` em `stripe.ts` é padrão de fábrica. Ler: `GET /api/pricing`.
- **Leads frios**: checkout exige estoque no idioma (409 `COLD_STOCK`); entrega pelo card ❄️ na
  ficha do comprador (Admin) → `lead_delivery_receipts` + aviso. `markColdLeads()` sem cron.
- **Noite** = 18h → 7:59 do dia seguinte (madrugada = dia anterior), em TypeScript
  (`availability.ts`) e em SQL (migration 051, `automatic_buyer_available`).
- **priority_only** (`lead_routing.priority_only`, 24/09): entrega só aos prioritários, sem fallback.
- Migrations aplicadas: 047 · 048 · 049 · 050 (trava de `is_admin`) · 051.

<!-- sync automático validado ponta a ponta em 28/09/2026 -->
