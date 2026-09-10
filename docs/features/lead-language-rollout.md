# Compras de leads BR e espanhol

## Comportamento

- Desktop e web mobile exigem escolha explícita, sem idioma pré-selecionado.
- `pt` = Leads BR (português); `es` = Leads em espanhol. O idioma da interface não decide o produto.
- Stripe, pagamento, crédito, histórico e fila mantêm o idioma escolhido. Os preços e a assinatura CRM não mudam.
- Compras, cortesias e bônus anteriores permanecem BR. Checkouts antigos sem metadado também são BR.
- Leads frios continuam com entrega manual. O pedido e o aviso para a equipe informam o idioma.
- O formulário Meta espanhol conhecido é identificado em `src/lib/lead-language.ts`. Novos formulários devem ser mapeados antes de ativar campanhas; um formulário desconhecido recebido pelo webhook fica pendente.
- Regras gratuitas de admin e fallback existentes continuam apenas BR. Sem comprador apto com saldo espanhol, o lead espanhol aguarda; não consome crédito BR.
- A migração não transfere leads, não altera saldo histórico e não envia notificações.

## Ordem obrigatória de publicação

1. Aplicar `supabase/migrations/041_lead_purchase_language.sql` no projeto correto, dentro da transação do arquivo. Conferir as três colunas e as duas funções. Não publicar o código antes desta etapa.
2. Publicar a aplicação a partir da branch `codex/lead-language-purchases`, baseada em `71143ac4cf2a1f5cd3d895477e9411f259a3b7bc`. Não usar o checkout local antigo como base para produção.
3. Validar a escolha na página `/dashboard/credits` e `/m/creditos`, a identificação no checkout Stripe e o histórico após uma compra autorizada.
4. Manter o aplicativo novo e a migração juntos. Depois de vender créditos espanhóis, não voltar para a distribuição antiga: ela mistura os saldos.

Nenhuma migração ou publicação de produção foi feita nesta implementação local. O acesso ao painel Supabase precisa ser restabelecido antes da etapa 1.

## Verificações locais

`npm test` executa testes sem serviços reais: checkout e webhook com doubles, migração em PostgreSQL embutido (PGlite), idempotência/rollback, permissões de função e entrega normal/programada por idioma. Não faz cobranças, envia mensagens ou usa dados de clientes.

`npm run build` usa a configuração existente do projeto, que ignora erros TypeScript. `npx tsc --noEmit` ainda acusa erros anteriores em settings, pipeline, traduções WDT, Stripe Subscription e push; não é um typecheck global limpo.

Resultado local em 31/08/2026: oito testes passaram e o build de produção concluiu. O browser-harness abriu os componentes desktop e identificou as duas opções e seis botões de compra. A conexão com o Chrome caiu antes de terminar os testes interativos/visuais desktop e mobile; essa verificação ainda precisa ser concluída antes da publicação. A página temporária de teste foi removida e não faz parte do build.

Reatribuição e reconciliação históricas merecem revisão manual para leads espanhóis entregues antes desta separação: o sistema antigo não registrava qual saldo financiou cada entrega. Não executar ajuste retroativo em massa como parte do rollout.
