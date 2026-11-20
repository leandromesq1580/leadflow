# Guias de produto Foresters em PT-BR (WDT Academy)

Estado: **publicado em 20/11/2026 por autorização expressa do dono (18:24:15 -05:00).** Proveniência: texto traduzido de PDFs oficiais
fornecidos pelo proprietário em 20/11/2026; sem dados pessoais. Tradução de apoio:
vale o texto original em inglês.

## Arquivos (13)

| Produto | Form (lido do PDF) | Guia PT | PDF PT | Original EN |
|---|---|---|---|---|
| SMART UL | 503346 US 04/20 | `docs/foresters-smart-ul.html` | `docs/pdf/foresters-smart-ul.pdf` | `docs/pdf/foresters-503346-smart-ul-original.pdf` |
| Level Term (Strong Foundation + Your Term) | 504387 US 05/21 | `docs/foresters-level-term.html` | `docs/pdf/foresters-level-term.pdf` | `docs/pdf/foresters-504387-level-term-original.pdf` |
| Live Well Plus | 506014 US 04/25 | `docs/foresters-live-well-plus.html` | `docs/pdf/foresters-live-well-plus.pdf` | `docs/pdf/foresters-506014-live-well-plus-original.pdf` |
| Advantage Plus II | 504933 US 03/20 | `docs/foresters-advantage-plus-ii.html` | `docs/pdf/foresters-advantage-plus-ii.pdf` | `docs/pdf/foresters-504933-advantage-plus-ii-original.pdf` |

Mais `public/academy/index.html` (módulo Seguradoras › Foresters: cada produto tem
"Guia em português" e "Original (EN)"; `foresters-guia.html` e a rota `#m-c2-2` ficam como estavam).

## Padrão comum dos 4 guias da Foresters

Todos têm: descrição; idades de emissão (idade mais próxima do aniversário); valor
segurado mínimo/máximo e faixas (banding); classes de subscrição (fumante/não fumante,
extras substandard); modos de prêmio com fator modal, prêmio mínimo e taxa de certificado;
dividendos, empréstimos, resgate, caducidade/carência (31 dias), reinstalação (3 anos),
benefício para caridade (1%, até $100,000); riders (ABR automático, Family Health Benefit,
Common Carrier ADR, Accidental Death, Waiver, Children's Term; Term/Paid-up Additions/GIR
conforme o produto); contatos (Sales Support Opção 1, Producer Service Opção 2).
Term (Level Term) troca dividendos/empréstimos por conversão e renovação anual.

## Avisos legais preservados (nos 4 guias)

- "For Producer Use Only. Not For Use With The Public." (não destinado à distribuição pública).
- Aviso de que o guia é só informativo, de que o produtor deve representar o produto pelo
  texto real do certificado/riders do estado, e de que produtos e riders podem não estar
  disponíveis em todos os estados.
- Foresters e seus representantes não dão aconselhamento jurídico, fiscal ou patrimonial.
- ABR: avisos NY/CA, seção 101(g) do IRC, efeito sobre programas de assistência pública.
- Marcas/endereço da The Independent Order of Foresters.

## Pontos ambíguos no original (sinalizados na página em caixa "Nota de conferência")

- Advantage Plus II: o sumário lista "Post Issue Changes › Face Amount Decreases › Certificate
  Change Fee", mas o corpo do PDF não traz esse texto. Nada foi acrescentado.
- Advantage Plus II (Single Payment PUA, médica): rótulo duplicado "Maximum single payment
  amount / Maximum annual payment amount"; o valor ($200,000) é inequívoco.
- Live Well Plus (Children's Term Rider): "Conversion Period" diz "until after the earliest
  of" (sem "two months", que aparece no Level Term e no Advantage). Traduzido como está.
- Live Well Plus: classes "Non-Tobacco/Tobacco" na lista de classes e "Standard" nas tabelas de
  valor segurado; o original não explica a correspondência.

## Testes

- `tests/academy_foresters_test.py` (`npm run test:academy`): fidelidade (todo `$`, `%`, faixa,
  prazo e fator modal da fonte aparece na página PT; todo `$`/`%` da página PT existe na
  fonte), avisos legais, form, ausência de dados pessoais, links do index, registro pendente.
- `tests/academy_foresters_browser_test.py`: Chromium real (desktop 1920, 1280, mobile 390),
  navegação Foresters › cada guia e original, `#m-c2-2`, sem erros de JS, sem overflow.
  Precisa de playwright+chromium (pula sem eles); não entra no `npm run test:academy`.
- Fixtures: `tests/fixtures/foresters-source/*.txt` = texto extraído dos originais EN.

## Publicação

`public/academy/` é ignorado pelo git; os 13 arquivos (12 novos + `index.html` alterado) entram com
`git add -f`, como os 236 anteriores. Registro de release: `manifest.json`, `allowlist.json` e
`authorization.json` (chave `foresters-guias-2026-11-20`) passaram de 236 para **248** arquivos
(236 + 12 novos; `index.html` mudou de hash, não de contagem). Os demais hashes não mudaram.

Decisão do dono e limites registrados em `authorization.json`:
- Os PDFs originais em inglês trazem "For Producer Use Only. Not For Use With The Public."; o dono foi
  avisado e autorizou publicar mesmo assim.
- A tradução PT-BR não foi revisada por humano: material de apoio, vale o original; não é certificação.

Conferência: `python3 scripts/academy-stage.py --manifest docs/academy-release/manifest.json --source public/academy --destination <novo>`
(ver `docs/academy-manifest-contract.md`) deve staging de 248 arquivos; deploy conforme `deploy-vercel.md`.
