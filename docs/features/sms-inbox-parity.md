# SMS na caixa de mensagens e nas não lidas

## Contrato implementado (aguardando publicação)

- `sms_messages` continua sendo a única fonte das mensagens SMS; não são criadas cópias em `whatsapp_messages`.
- `/api/whatsapp/unread`, `/conversations` e `/messages` agregam os dois canais. O sino existente passa a dizer **WhatsApp / SMS**. Os nomes das URLs/eventos legados são preservados por compatibilidade.
- `read_at` é persistido no SMS. Só mensagens `direction = 'in'`, `status = 'received'`, sem `read_at` contam como não lidas. O histórico inclui envio e recebimento.
- O dono de SMS é resolvido pelo lead **no momento da consulta ou confirmação de leitura**: comprador do membro atribuído, se válido; caso contrário, comprador da agência. Mensagens WhatsApp históricas não autorizam acesso ao SMS de outro dono.
- As RPCs da migration `078_sms_inbox_read.sql` são exclusivas de `service_role`. A API autentica o comprador e o escopo antes de chamá-las. `p_admin` é derivado de autorização no servidor, não do JSON enviado pelo cliente.
- A confirmação de leitura, tanto na thread desktop quanto na mobile, usa IDs do snapshot que a thread carregou; mensagens posteriores não são marcadas por acidente. IDs são validados como UUIDs antes de qualquer escrita (limite de 10.000 por confirmação); PATCH legado de uma thread sem snapshot não marca SMS. A ação explícita de marcar todas as mensagens do comprador continua abrangendo ambos os canais. A UI não confirma leitura em aba oculta, após desmontagem, nem quando a carga falha. O evento `wa-unread-changed` só é emitido após PATCH bem-sucedido, atualizando o sino imediatamente (inclusive se chega durante uma consulta anterior). Há polling e recarga ao voltar à aba.
- Falha na consulta SMS produz HTTP 503 em vez de um contador silenciosamente zerado/histórico parcial. A implantação exige preparar a migration **antes** de publicar o código que usa as RPCs.

## Notificação não significa entrega garantida

O webhook SMS já acionava WhatsApp do dono, grupo e push; o commit anterior corrigiu a resolução do dono efetivo. Esses envios continuam **best effort**, sem outbox/garantia de entrega. Esta mudança acrescenta o estado persistido de leitura e integra SMS ao mecanismo in-app existente — não usa o sucesso de um push como estado de leitura.

O som/banner encontrado em `meeting-banner.tsx` pertence a lembretes de agenda, não às mensagens WhatsApp recebidas. Não foi conectado ao SMS, nem criado som novo sem requisito. O sino/polling/evento de não lidas e a thread são os mecanismos de mensagens reaproveitados.

## Migração e limites

A migration foi exercitada em PGlite com dados sintéticos, **não aplicada em produção**. SMS recebidos anteriormente ficam não lidos inicialmente, pois o sistema não tinha uma leitura persistida que permitisse inferir seu estado real. Atribuir um lead a outro comprador transfere a visibilidade de seus SMS; não redefine o `read_at` existente.

Esta implementação não confirma a causa de nenhum incidente específico de produção. Não houve envio real, alteração de ambiente, migration aplicada, nem deploy.

## Regressões locais

- `tests/sms-inbox-parity.test.ts`: contratos das rotas, contadores, histórico, snapshot, falhas fechadas e paginação, com dependências HTTP/DB sintéticas.
- `tests/sms-inbox-sql.test.ts`: SQL real em PGlite; dono/membro/agência, isolamento, reatribuição, permissões, snapshot e idempotência.
- `tests/reply-alerts-history.test.ts`: regressões anteriores preservadas; apenas o mock de banco foi estendido para representar a nova RPC como fonte SMS vazia nas fixtures WhatsApp.
- `tests/sms-inbox.ui.mjs`: componentes reais montados em Chromium com HTTP de loopback; sem copiar lógica de produção para o teste. Executar com `SMS_UI_TOOLS` apontando ao pacote Playwright, `SMS_UI_OUTPUT` ao diretório de evidências e, opcionalmente, `SMS_UI_CHROME` ao Chromium instalado. Realtime é stubado; a prova de eventos ocorre pelo polling/HTTP local, não pelo Supabase real.

Executar suites/build somente em cópia sem `.env`, com credenciais de fixture e rede externa bloqueada, conforme o procedimento offline do projeto. Falhas gerais devem ser comparadas ao baseline, não desativadas para obter verde.
