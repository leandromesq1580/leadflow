# ADR-001: Captura de leads Meta migrada de cron em VPS para Vercel Cron

## Context

A captura de novos leads da Meta Graph API rodava em crontab de um VPS anterior
(`31.220.97.186`, hoje retirado), chamando `/api/poll-leads` a cada 2 minutos com
`POLL_SECRET`. Esse VPS deixou de existir/ser confiável, interrompendo a captura
(incidente confirmado: 36 leads Meta ficaram sem captura, recuperados manualmente
em 04/09/2026 — ver `docs/integrations/meta-ads.md`).

## Options Considered

1. Recriar um crontab em outro VPS, replicando a dependência de infraestrutura extra.
2. Usar o cron nativo da Vercel (exige plano Pro; o projeto estava em Hobby, que
   só permite 1 execução diária).
3. Mover a captura para dentro do próprio processo Next.js sem agendamento externo
   (webhook-only) — descartado porque a Meta não garante entrega via webhook para
   todos os formulários/casos de borda; o poll é o mecanismo de recuperação.

## Decision

Fazer upgrade do plano Vercel para Pro e usar `vercel.json` (`crons`) para agendar
`/api/poll-leads` a cada 2 minutos e `/api/cron/run-all` a cada 5 minutos, com
`CRON_SECRET` dedicado (mantendo `POLL_SECRET` como fallback aceito para manutenção
manual). Commit de referência: `dd2a708` (04/09/2026).

## Why

- Elimina a dependência de um VPS extra só para agendamento — menos uma peça de
  infraestrutura para falhar/monitorar.
- Vercel Cron já roda no mesmo ambiente de execução do app, com mesmas env vars e
  observabilidade dos logs de função.
- O código ganhou paginação, checkpoint (`settings.meta_poll_health`) e lease
  (`settings.meta_poll_lease`) para tornar o poll resiliente a interrupções — algo
  que não existia na versão anterior baseada em crontab simples.

## Consequences

- Custo recorrente do plano Vercel Pro (antes Hobby).
- Toda alteração de agendamento passa a viver em `vercel.json`, versionado no
  próprio repositório — mais visível que um crontab externo.
- Não há mais dependência de nenhum VPS para agendamento do app; os VPS restantes
  (VPS-1 wa-bridge, VPS-2 ChatbotX) não fazem parte do agendamento de cron do app.

## Risks

- Se o plano Vercel for revertido para Hobby, a captura volta a ficar limitada a
  execuções diárias — reintroduziria o mesmo tipo de incidente.
- `CRON_SECRET`/`POLL_SECRET` nunca devem ir para logs, screenshots ou URL versionada.

## Date

2026-09-04 (commit `dd2a708`); documentado retroativamente em 2026-09-10.
