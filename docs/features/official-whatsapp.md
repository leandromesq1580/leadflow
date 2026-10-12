# Contato oficial de WhatsApp

O contato público definido pelo proprietário é `17867442126` (exibição: `1 786 744 2126`).

## Onde é usado

- `src/lib/official-whatsapp.ts` concentra os valores consumidos pelo gerador administrativo de e-mails, pelo CTA de WhatsApp e pelo botão da página `/old`.
- As páginas estáticas `public/nova/index.html`, `public/nova/en/index.html` e `public/nova/es/index.html` usam o mesmo destino no link de suporte e na configuração dos botões/agendamento. Por serem HTML independentes, os valores são conferidos por teste de paridade.
- O campo WhatsApp do gerador continua editável; o número oficial é o padrão de uma nova abertura. Nenhum telefone é enviado à IA: o link é acrescentado localmente pela aplicação.

## Limites

Alterar o contato público não muda a sessão conectada, o canal remetente de avisos, contas de compradores, conversas, rascunhos/campanhas já gravados nem mensagens já enviadas. Não há migration, edição de variáveis ou restart nesta alteração.

A captura automática de novos clientes pelo webhook continua vinculada à conta de vendas já configurada. O número oficial dos links não reatribui essa conta nem altera o roteamento da entrada. Conexão/recebimento no novo número e captura automática por esse canal não são comprovados pelos testes de links; exigem verificação própria.

## Verificação

`tests/official-whatsapp.test.ts` confere dígitos/exibição, o link real renderizado pelo CTA, preservação da mensagem, nova aba e evento de publicidade, os seis destinos das três páginas estáticas e o uso da constante em `/old`. `tests/email-campaign-ai-editor.test.ts` confere o novo padrão efetivamente renderizado no campo e ausência do antigo, mantendo a proibição de envio ao gerar.

Publicar exige autorização do proprietário. Antes de afirmar que está em produção, conferir domínio, versão da publicação e os links servidos nessa execução. Os testes não clicam nem enviam mensagem real.
