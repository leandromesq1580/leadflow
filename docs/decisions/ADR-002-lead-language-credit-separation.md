# ADR-002: Separação de saldo de créditos por idioma do lead (BR/ES)

## Context

O sistema vendia e distribuía leads sem diferenciar idioma — todo saldo de crédito
era tratado como um único pool. Havia demanda para vender leads em espanhol (mercado
hispânico) sem misturar com o saldo/fila de leads em português, já que preços,
histórico e regras de distribuição precisavam permanecer coerentes por idioma.

## Options Considered

1. Manter um único pool de créditos e adicionar apenas uma tag informativa de idioma
   sem afetar a lógica de distribuição — descartado: um comprador sem saldo espanhol
   poderia consumir crédito BR para um lead ES por engano, misturando contabilidade.
2. Criar um sistema de créditos totalmente separado (tabelas novas) — descartado como
   desproporcional; a estrutura de `credits` já suportava extensão por tipo/idioma.
3. Estender o schema existente (`leads`, `credits`) com coluna de idioma e funções
   de distribuição que respeitam o idioma na hora de decidir compradores elegíveis.

## Decision

Adotar a opção 3: migration dedicada (`044_lead_purchase_language.sql`, branch
`codex/lead-language-purchases`, commit `8e484e9` em 31/08/2026) adiciona a
semântica de idioma (`pt`/`es`) em `leads.lead_language` e nas funções de distribuição/
crédito, exigindo escolha explícita de idioma na compra (sem pré-seleção). Formulários
Meta conhecidos mapeiam o idioma automaticamente (`src/lib/lead-language.ts`); um
formulário desconhecido recebido pelo webhook fica pendente em vez de assumir idioma.

## Why

- Reaproveita o schema e a lógica de distribuição existentes em vez de duplicar
  toda a stack de créditos.
- Falhar explicitamente (lead pendente) quando o idioma não pode ser determinado é
  mais seguro do que adivinhar e misturar saldo.
- Compras, cortesias e bônus anteriores à mudança continuam BR por padrão — não
  quebra histórico nem exige migração retroativa de dados.

## Consequences

- Toda nova função de distribuição/crédito precisa considerar o idioma como
  dimensão de elegibilidade, não só estado+interesse+saldo.
- Regras gratuitas de admin/fallback continuam só BR — um lead ES sem comprador
  apto aguarda em vez de consumir crédito BR (ver `docs/features/lead-language-rollout.md`).
- Reatribuição/reconciliação de leads espanhóis entregues **antes** desta separação
  não tem registro de qual saldo financiou a entrega — não foi feito ajuste
  retroativo em massa, por decisão explícita no rollout original.

## Risks

- Um novo formulário Meta não mapeado em `src/lib/lead-language.ts` fica pendente
  até ser mapeado manualmente — pode gerar atraso de captura de campanhas novas se
  o mapeamento não for feito antes de ativar uma campanha em espanhol.

## Date

2026-08-31 (commit `8e484e9`); documentado retroativamente em 2026-09-10.
