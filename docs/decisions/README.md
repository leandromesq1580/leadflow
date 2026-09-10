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

- [ADR-001](ADR-001-meta-capture-vercel-cron.md) — Captura de leads Meta migrada de cron em VPS para Vercel Cron (2026-09-04).
- [ADR-002](ADR-002-lead-language-credit-separation.md) — Separação de saldo de créditos por idioma do lead BR/ES (2026-08-31).
