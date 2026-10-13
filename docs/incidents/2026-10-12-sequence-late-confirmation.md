# Confirmação tardia bloqueava o remetente das sequências

## Evidência e limites

Uma inscrição de WhatsApp ficou pausada como `delivery_unknown`, com despacho `unknown` que impedia outros 28 contatos ativos do mesmo remetente. Existia uma única saída com mesmo comprador, lead, remetente, destinatário e corpo; seu identificador WhatsApp e timestamp foram conferidos. A saída foi registrada aproximadamente 23 segundos depois da tentativa. O engine IA publicado dava apenas 20 segundos ao HTTP; a bridge admite até 45 segundos somente para `sendMessage`, além da busca do destinatário.

O timeout desigual é uma causa reproduzida em teste e consistente com o incidente. Sem a exceção original do transporte, não é possível provar qual falha de rede/HTTP ocorreu na tentativa histórica. Histórico de saída tampouco comprova recebimento no telefone do destinatário.

## Recuperação autorizada

Após autorização explícita, houve ensaio com rollback e conciliação transacional de **um** despacho por IDs exatos, identidade do ciclo/passo e comprovante único. Nenhuma mensagem foi reenviada. A inscrição afetada permaneceu pausada; apenas sua proteção `delivery_unknown` foi resolvida. Os 28 contatos **já ativos** tiveram sua espera liberada. As 16 pausas manuais foram comparadas antes/depois e permaneceram intactas. A fila registrou seis novas saídas após a recuperação.

A operação pontual não faz parte da migration, não é um backfill automático e não deve ser reaplicada. Evidências privadas estão preservadas no scratch `sequence-recovery-20261013-0032Z` do perfil lead4pro.

## Prevenção

- Um único POST de transporte, com mínimo de 75 segundos, abaixo da reserva de 120 segundos do despacho.
- Depois de uma resposta v2 confirmada para **a mesma operação e remetente**, tentar persistir o recibo. Se a resposta do banco falhar ou se perder, repetir somente sua persistência, nunca o envio.
- Migration aditiva 065: comprovante correlacionado pode resolver um despacho `unknown`/reserva expirada. Mantém a inscrição pausada/parada quando houve pausa, resposta, STOP ou perda de reserva; não reativa contatos.
- Recibo idempotente por despacho/ciclo/passo e identificador WhatsApp. Operação, remetente, destinatário e conflito de recibo divergentes são recusados. Função exclusiva de `service_role`.
- Preserve ordem de locks enrollment → dispatch → sender, orçamento seis/15 minutos e todas as proteções compartilhadas por comprador/lead. A confirmação automática resolve somente o despacho: nem mesmo a proteção `delivery_unknown` global é removida, pois pode representar uma parada manual posterior ou outro despacho incerto.
- Sem confirmação válida, a proteção conservadora permanece: timeout total, queda completa do processo, resposta inválida e indisponibilidade persistente do banco **não** autorizam reenvio nem liberação automática.

## Verificação e publicação

Regressões focadas executam o TypeScript real com I/O sintético e a migration em PostgreSQL/WASM; testes PostgreSQL 16 multissessão cobrem confirmações simultâneas e disputa confirmação → próxima reserva. Suíte/build, revisão independente e produção ficam registrados por SHA nos artefatos de gates/publicação.

Aplicar 065 e conferir ACL/definição antes de publicar a web. Não modifica a bridge, suas configurações ou o limite seis/15 minutos. Rollback da web mantém a migration aditiva, mas volta a perder a prevenção no engine. Não prometer ausência universal de travamentos: o conserto cobre confirmação tardia e perda temporária da resposta do banco, sem sacrificar a proteção contra duplicação.
