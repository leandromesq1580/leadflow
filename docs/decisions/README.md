# Architecture Decision Records (ADR)

Decisões técnicas importantes do Lead4Pro que não são óbvias a partir do código
sozinho. Objetivo: qualquer agente ou dev novo consegue responder "por que fizemos
desse jeito?" sem depender de memória de conversa específica.

## Quando criar um ADR

Antes de uma decisão técnica não-trivial e dificilmente reversível (escolha de
provedor, mudança de arquitetura, trade-off relevante). Não crie ADR para toda
mudança pequena — isso é ruído.

## Formato

Nome: `ADR-NNN-titulo-curto.md`, numeração sequencial.

```markdown
# ADR-NNN: Título

## Context
## Options Considered
## Decision
## Why
## Consequences
## Risks
## Date
```

## Índice

Nenhum ADR registrado ainda (auditoria de 2026-09-09). Decisões técnicas relevantes
já tomadas mas não formalizadas como ADR incluem: substituição do cron VPS por
Vercel Cron Pro para captura Meta (ver `docs/integrations/meta-ads.md`) e a separação
de saldo de créditos BR/ES (ver `docs/features/lead-language-rollout.md`). Retroagir
esses dois em ADR é opcional — priorize registrar decisões daqui para frente.
