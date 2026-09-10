# AGENTS.md — Lead4Producers (Lead4Pro)

Manual de entrada para qualquer agente de IA (Hermes, Claude Code, Codex ou outro)
que for trabalhar neste repositório. Este arquivo é o ÍNDICE + manual operacional —
para detalhe, siga os links para `docs/`.

<!-- BEGIN:nextjs-agent-rules -->
## ⚠️ Este não é o Next.js que você conhece

Next.js 16 (App Router, Turbopack) tem breaking changes vs versões anteriores —
APIs, convenções e estrutura de arquivo podem diferir do seu treinamento. Leia o
guia relevante em `node_modules/next/dist/docs/` antes de escrever código. Respeite
avisos de deprecation.
<!-- END:nextjs-agent-rules -->

## O que é o Lead4Pro

Marketplace de leads de seguro de vida para corretores brasileiros nos EUA, com CRM
embutido e automação de contato (WhatsApp/Email/SMS/Voz). Detalhe completo:
[`docs/architecture/overview.md`](docs/architecture/overview.md).

## Arquitetura — resumo

| Camada | Onde | Acesso |
|---|---|---|
| Web + API (Next.js 16) | Vercel | sem SSH — via `l4p-vercel` (deploy) |
| Banco (PostgreSQL) | Supabase gerenciado | sem SSH — via `l4p-sql` / `l4p-sql-write` |
| WhatsApp (wa-bridge) | VPS-1, systemd (**sem Docker**) | SSH |
| ChatbotX | VPS-2, Docker | SSH |

Detalhe completo, incluindo ambientes: [`docs/architecture/infrastructure.md`](docs/architecture/infrastructure.md).
Modelo de dados e semântica de colunas (não adivinhe nomes de coluna):
[`docs/architecture/data-model.md`](docs/architecture/data-model.md).

## Estrutura do repositório

```
src/app/          # Next.js App Router — páginas + API routes (src/app/api/<recurso>/route.ts)
src/lib/          # lógica de negócio compartilhada (distribuição de leads, wa-bridge, etc.)
src/components/   # componentes React
supabase/migrations/   # migrations SQL numeradas sequencialmente (NNN_descricao.sql)
infra/vps/        # código-fonte dos serviços que rodam no VPS-1 (wa-bridge, admin, watchdog)
tests/            # node:test — `npm test`
docs/             # base de conhecimento curada e versionada (ver docs/README.md)
```

## Stack principal

Next.js 16 · React 19 · TypeScript · Supabase (Postgres + Auth + RLS) · Stripe ·
Resend · Twilio · Anthropic Claude (AI lead scoring) · whatsapp-web.js (wa-bridge).

## Comandos

```bash
npm run dev                                              # rodar local
npm run build                                             # build de produção
npm test                                                   # node:test (tests/*.test.ts)
npx eslint $(git diff --name-only main -- '*.ts' '*.tsx')  # lint só nos arquivos tocados
                                                            # (lint completo na main dá ~898 erros pré-existentes — inútil como portão)
```

Baseline conhecido: 2 testes falham por incompatibilidade de mock timers Node 22 vs
20.9 (`automation-scheduling`, `lead-message-language`) — não é regressão sua se só
esses 2 falharem. Detalhe: [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md).

## Como investigar problemas

Comece por [`docs/runbooks/production-diagnostics.md`](docs/runbooks/production-diagnostics.md).
O caminho de um lead é Meta → Vercel (API) → Supabase → wa-bridge — a maioria dos
diagnósticos exige consultar mais de uma camada, não só uma.

## Onde encontrar documentação

- [`docs/architecture/`](docs/architecture/) — como o sistema é feito.
- [`docs/runbooks/`](docs/runbooks/) — diagnóstico, deploy, disaster recovery.
- [`docs/decisions/`](docs/decisions/) — ADRs (por que decidimos assim).
- [`docs/incidents/`](docs/incidents/) — investigações de produção documentadas.
- [`docs/integrations/`](docs/integrations/) — Meta Ads, wa-bridge, etc.
- [`docs/features/`](docs/features/) — comportamento de features específicas.
- `DOCUMENTACAO_SISTEMA.md` (raiz) — **histórico**, seções de infraestrutura
  desatualizadas; seções de comportamento funcional (3–9) ainda são úteis.

## Regras de Git

- Nunca commitar/push direto na `main`. Sempre branch `fix/<assunto>` ou `feat/<assunto>`.
- Commits coerentes: não misturar código + documentação não relacionada + outras mudanças.
- Mensagens de commit em PT-BR, padrão `fix(escopo): ...` / `feat(escopo): ...`.
- `.env*` é git-ignored — nunca commitar segredo.

## Regras de segurança

- Nunca registrar valor de senha, API key, token, cookie, credencial de banco ou
  conteúdo de `.env` em nenhum documento, log ou resposta. Pode documentar **que**
  a credencial existe e **onde** é gerenciada, nunca o valor.
- Atenção: a URL do Postgres começa com `postgresql://` (com "ql") — filtre os dois
  prefixos ao lidar com variáveis de ambiente.
- Nunca abrir o painel do sistema no navegador nem pedir login "para olhar o número" —
  se falta acesso a um dado, diga isso em uma linha e pare.

## Processo de deploy e o que exige aprovação explícita

Deploy nunca é automático. Fluxo completo em [`docs/runbooks/deploy.md`](docs/runbooks/deploy.md).

**Exige "sim" explícito antes de executar:**
- Deploy em produção (`l4p-vercel deploy --prod --yes`)
- Migration de banco (`l4p-sql-write -f ...`)
- Restart de serviço/container
- Rollback
- Mudança de configuração ou variável de ambiente (`.env`, `vercel env add`)
- Qualquer escrita em produção via API admin (créditos, plano, reatribuição de lead)

**Pode ser feito sem perguntar (verde):** ler status/logs/CPU/RAM/disco, health
checks, Git, código; investigar erros; consultas somente-leitura ao banco; testar
endpoints não destrutivos; editar código local, rodar lint/test/build, criar branch.

## O que um agente NUNCA deve fazer automaticamente

- `DROP DATABASE`, DELETE em massa, `docker volume rm`, `docker system prune`.
- Apagar dados, containers, volumes ou servidores.
- Revelar segredos, senhas, tokens ou chaves privadas.
- Push direto na `main`, ou deploy/rollback/migration sem aprovação explícita.
- Inventar/adivinhar dado que não pode obter (contagem de leads, registro de banco) —
  a resposta correta é dizer que falta acesso, não improvisar caminho alternativo.
- Copiar automaticamente conversas/sessões inteiras para `docs/` — só promova
  conhecimento que tenha valor futuro confirmado (fato → memory do agente;
  procedimento → skill/runbook; arquitetura/decisão/incidente → `docs/`).
