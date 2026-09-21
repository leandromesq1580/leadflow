# Leads frios: estoque obrigatório e entrega com recibo — 2026-09-21

## Por quê
Em 20/07/2026 um cliente pagou $300 por 100 leads frios com **estoque zero**: o webhook
"entregou" 0 em silêncio; um minuto depois a entrega virou "planilha manual" (commit
`1db8843`) e ninguém entregou. Sem rastro, virou chargeback sem defesa
(`du_1U9csVRdCjUR96oHWouEkdZH`). Uma segunda compra (25 frios, 21/07) também consta
sem entrega. `markColdLeads()` não tem cron — o estoque de frio não se repõe sozinho.

## O que muda
1. **Checkout** (`/api/checkout`): pacote `cold_lead` só é vendido se `countColdStock(idioma) ≥ quantidade`; senão **409 `COLD_STOCK`** com a mensagem em português. Tela de compra web e app mostram "Disponíveis agora: BR n · ES n" e o botão vira **Esgotado** no idioma escolhido.
2. **Entrega pelo admin** (`/admin/buyers/[id]` → card "❄️ Leads frios comprados"): por compra paga mostra entregues/restantes; "Entregar N" atribui leads frios reais (novos, sem dono, mesmo idioma; estados licenciados primeiro) ao comprador com `delivery_credit_id` → o trigger `capture_lead_delivery_receipt` gera `lead_delivery_receipts` ligados ao pagamento (append-only); o cliente recebe e-mail + WhatsApp (`notifyColdLeadsDelivered`) e cada lead ganha `lead_notification_receipts` (`cold_delivery_summary`). "⬇ Planilha dos entregues" exporta CSV do que já foi entregue.
3. O crédito `cold_lead` da compra é criado na 1ª entrega (ligado por `stripe_payment_intent_id`) só pra amarrar recibo ↔ pagamento; não entra na fila de leads quentes (a elegibilidade filtra `type='lead'`).

## API
- `GET /api/admin/buyers/[id]/deliver-cold` → `{ purchases: [{payment_id, quantity, delivered, remaining, lead_language…}], stock: {pt, es} }`
- `GET …/deliver-cold?payment_id=…&format=csv` → CSV dos leads entregues daquela compra
- `POST …/deliver-cold` `{ payment_id, quantity }` → entrega até `quantity` (nunca passa do comprado nem do estoque)

## Pendências
- Estoque de frio não se repõe: `markColdLeads()` (7+ dias sem dono) não é chamado por nenhum cron — decidir se volta a rodar ou se o produto sai do catálogo (`/admin/precos` → Leads frios sem pacote).
- Compras antigas sem entrega: Raphael (100, em disputa) e Rhuan Alaor Toledo (25) — aparecem no card com "faltam N".

## Testes
`node --test tests/cold-leads.test.cjs` (estoque, entrega com recibo/crédito/aviso, teto da compra, 409 no checkout).
