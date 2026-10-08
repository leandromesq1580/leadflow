# Recursos administrativos por usuário

Em **Admin → Compradores → ficha do comprador → Ações Admin**, a seção **Recursos por usuário** inclui **Ligação com IA**.

| Opção | Efeito |
|---|---|
| Padrão | Segue a assinatura ativa ou a cortesia existente. Sem autorização anterior, fica inativo. |
| Liberado | Libera a IA para esse comprador, mesmo sem assinatura. Não cria cobrança. |
| Bloqueado | Impede IA nas novas chamadas e geração/leitura de sugestões, inclusive para assinantes. Não impede a ligação normal nem sua gravação. |

Não cancela ou altera assinaturas, franquias, pagamentos, créditos, roteiros ou planos de CRM. Bloquear durante uma ligação impede novas sugestões, mas não encerra a transcrição já iniciada no Twilio: os minutos dessa chamada continuam sendo contabilizados. O administrador deve tratar cancelamento/cobrança separadamente. A verificação é por requisição; uma geração já em andamento pode concluir, mas a API bloqueada não expõe a sugestão.

## Persistência e autorização

- Catálogo extensível: `src/lib/buyer-features.ts`; primeiro recurso `ia_ligacao`. Novos recursos precisam integrar também seu ponto de execução, não apenas entrar na lista.
- Cada combinação recurso/comprador tem uma chave própria em `settings`: `buyer_feature:<feature>:<buyerId>`. Isso evita sobrescrever listas globais de outros compradores e os dados do Stripe.
- A entrada guarda `mode`, `updated_by` e `updated_at` da última alteração. Não é histórico completo de alterações.
- GET/POST `/api/admin/buyers/[id]/features`: sessão autenticada e comprador administrador. IDs, recurso, modo e JSON são validados; alvo precisa existir.
- Retorno da escrita relê a permissão. Erros não confirmam sucesso; atualização concorrente pode resultar em 409. Isso não é serialização transacional nem bloqueio de chamadas já em andamento.
- O webhook de saída verifica a assinatura Twilio existente e usa `From=client:<buyerId>` como identidade para a permissão, nunca o `buyerId` customizado do navegador.
- Erro de leitura ou entrada inválida bloqueia IA; a ligação normal permanece disponível.
- Bloqueio administrativo rejeita checkout do add-on; acesso já liberado não gera nova assinatura redundante. O webhook Stripe continua preservado e não remove overrides administrativos.

## Publicação

Somente release web, após autorização. Sem migration, variável, chave de provedor, restart ou modificação automática de permissões de clientes. Nenhuma chave de override é criada durante o deploy: as permissões atuais são preservadas até o administrador escolher um modo.

## Verificação local

`node --import tsx --test tests/buyer-features.test.ts tests/voice-routing.test.cjs`

Os testes carregam os handlers e componentes reais, isolando IO com dados fictícios. Cobrem precedência, identidade assinada, autorização, validação, falha do banco, persistência/readback, isolamento entre compradores, TwiML, sugestões, checkout e renderização dos controles. Não fazem chamada telefônica, cobrança ou escrita em produção. Cliques reais/autenticação real e chamada IA com o provedor são NÃO VERIFICADOS por essa suíte.
