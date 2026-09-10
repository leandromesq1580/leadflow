# Infraestrutura — ambientes e acesso

## Ambientes

| Ambiente | Onde | Observação |
|---|---|---|
| Local | máquina do agente/dev | `npm run dev`; usa `.env.local` (git-ignored, nunca commitado) |
| Staging | **não existe hoje** | UNKNOWN se há plano de criar; confirme com o Leandro antes de presumir |
| Production | Vercel (branch `main`) + Supabase + VPS-1 (wa-bridge) + VPS-2 (ChatbotX) | deploy não é automático — ver `docs/runbooks/deploy.md` |

**Nunca presuma que uma operação segura em local/staging é segura em produção.**
Hoje não há staging real: toda validação além de local é feita direto contra produção
com dados/consultas somente-leitura, ou em uma branch antes do merge.

## VPS-1 — `62.146.229.13` (wa-bridge, systemd, SEM Docker)

- 58 instâncias `wa-bridge@<cliente>.service` + `wa-bridge.service` (canal comercial
  "regiane", porta 3466 — **não confundir com `wa-bridge@regiane`, que fica disabled
  de propósito**) + `wa-bridge-admin` (porta 3458, autoridade de portas) +
  `wa-bridge-watchdog.timer`.
- Dados de sessão em `/opt/wa-bridge-data` (~1,6 GB/cliente).
- Também hospeda DeedWise, Carvero, Crystal backend — não fazem parte do Lead4Pro.
- Acesso: `ssh lead4pro-prod` (usuário `hermes`, sem sudo, só leitura — grupo
  `systemd-journal`) ou `ssh root@62.146.229.13` (chave pessoal do Leandro, poder total).
- Runbook de restauração completo: `docs/runbooks/disaster-recovery.md`.

## VPS-2 — `13.140.34.199` (ChatbotX, Docker)

- 8 CPU / 23 GB RAM / 290 GB disco, Docker 29.1.3, projeto compose `chatbotx` em
  `/opt/chatbotx`, proxy **Caddy** (não nginx), domínio `chatbot.lead4producers.com`.
- Acesso: `ssh root@13.140.34.199`.

## Vercel (web + API)

- Projeto `leandros-projects-4071f17d/leadflow`, domínio `lead4producers.com`.
- Deploy manual via wrapper `l4p-vercel` (nunca `vercel` direto — ver `docs/runbooks/deploy.md`).
- Variáveis de ambiente de produção (nomes confirmados via `l4p-vercel env ls production`,
  **valores nunca lidos/impressos**): `RESEND_FROM_EMAIL, MANUAL_EMAIL_POSTAL_ADDRESS,
  DIAG_SECRET, CRON_SECRET, TWILIO_TWIML_APP_SID, TWILIO_API_KEY_SECRET,
  TWILIO_API_KEY_SID, WA_ADMIN_KEY, WA_ADMIN_URL, WA_BRIDGE_URL, TWILIO_FROM_NUMBER,
  TWILIO_AUTH_TOKEN, TWILIO_ACCOUNT_SID, STRIPE_WEBHOOK_SECRET,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, STRIPE_SECRET_KEY, FORCE_ASSIGN_TO_EMAILS,
  OPENAI_ASSISTANT_ID, OPENAI_API_KEY, WA_BRIDGE_OWNER_BUYER_ID, ANTHROPIC_API_KEY,
  VAPID_SUBJECT, VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY, META_VERIFY_TOKEN,
  NEXT_PUBLIC_APP_URL, POLL_SECRET, RESEND_API_KEY, META_PAGE_TOKEN, WA_BRIDGE_KEY,
  ADMIN_WHATSAPP, EVOLUTION_API_KEY, EVOLUTION_JARVIS_KEY, WHATSAPP_ADMIN_GROUP,
  EVOLUTION_INSTANCE, EVOLUTION_API_URL, META_APP_SECRET, ADMIN_EMAIL,
  SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL`.
- Cron nativo da Vercel (Pro plan) — ver `docs/architecture/overview.md`.
- Cada mudança de env: `l4p-vercel env add NOME production` (amarelo).

## Supabase (banco)

- Gerenciado, sem SSH. Leitura: `l4p-sql` (role `hermes_readonly`, força sessão
  somente-leitura). Escrita: `l4p-sql-write -f arquivo.sql` (amarelo, só após "sim").
- Nunca usar `psql` direto nem a REST do Supabase — sempre os wrappers.

## Segurança — regra dura

Nunca registrar valores de segredo em nenhum documento deste repositório. Pode-se
documentar **que** uma credencial existe e **onde** é gerenciada, nunca o valor.
Lembrete: a URL do Postgres começa com `postgresql://` (com "ql"), filtrar os dois
prefixos ao lidar com variáveis de ambiente.
