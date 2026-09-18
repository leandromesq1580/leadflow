# Preços de leads geridos pelo admin (`/admin/precos`) — 2026-09-18

## O que é
Tela no Admin onde o dono define o **valor do lead** e os **pacotes** (exclusivo e frio).
Salvou → vale na hora. Fonte única: `settings.key='lead_pricing'` lida por
`src/lib/lead-pricing.ts`. `PRODUCTS` em `src/lib/stripe.ts` virou **padrão de fábrica**
(usado só enquanto o admin nunca salvou).

## Onde o preço aparece / é cobrado (todos leem o catálogo)
| Superfície | Como |
|---|---|
| `/api/checkout` (cobrança) | `readPricingCatalog` (estrito: erro de banco = 500, nunca cobra preço velho) + `findPackage(id)` |
| Compra web `/dashboard/credits` | server component, `readPricingCatalogOrDefault` |
| App `/m/creditos` | `/api/m/credits` devolve `catalog` |
| Preview de cupom `/api/coupon/validate` | catálogo |
| Landing `public/nova/*.html` | script busca `/api/pricing` (público, cache 60 s) → `PRECO_CLIENTE` e "a partir de $X" |
| Landing antiga `/old` | server component |
| Calculadora `/dashboard/calculadora` | presets via `/api/pricing` |
| Checklist de boas-vindas | "Comece com N leads por $X" |
| Meta Ads (`/api/admin/ads-insights`) | receita estimada = leads × preço de entrada |

## Regras
- Pacote = quantidade (1–10.000, única) + preço por lead ($1–$1.000, centavos inteiros). Até 6 por produto.
- `id` derivado `lead_<qtd>` / `cold_<qtd>` → ids antigos continuam válidos (`?package=lead_10`).
- Lead exclusivo precisa de ≥1 pacote; lead frio pode ficar sem pacote (= não vende).
- "Preço do lead" na tela = preço do menor pacote; mudar ele desloca todos os pacotes
  pelo mesmo valor (mantém o desconto de cada pacote).
- Precedência do preço unitário continua: `sales_team_pricing` > cupom > **catálogo**.
- Histórico: cada gravação empurra a versão anterior em `settings.lead_pricing_history`
  (30 últimas, com quem/quando).

## Efeitos colaterais conhecidos
- `src/lib/referral.ts` tem recompensas fixas por total original ($280→$15 etc.); total
  novo cai no percentual (5% de leads). Decisão do dono se quiser mudar a tabela.
- Textos em `src/lib/i18n.ts` (`pricing.plans.*.features`, `landing.steps`) ainda citam
  $280/$28 — não são renderizados por nenhuma tela (código morto), deixados como estão.
- Apple IAP não vende leads (só CRM), então não há preço a sincronizar na App Store.

## Testes
`node --test tests/lead-pricing.test.cjs` (validação, leitura/fallback, histórico, checkout
cobrando o catálogo vigente) e `tests/sales-team-pricing.test.cjs` (mock ganhou `settings`).
