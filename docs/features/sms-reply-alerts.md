# Aviso de respostas SMS no CRM

## Estado
Implementação local na branch `feat/sms-resposta-aviso`. Sem migration, push, merge, deploy ou envio de mensagens em produção. A publicação e a migration dependem de autorização explícita do Leandro.

## Comportamento
- Balão azul com texto SMS e contagem própria nos cartões do Pipeline desktop e nas listas de conversas desktop/mobile.
- A conversa existente agrega WhatsApp e SMS; SMS recebido fica com fundo azul e etiqueta SMS.
- Resposta exclusivamente por SMS entra na lista de conversas e na contagem de não lidas; WhatsApp segue separado nos balões e agregado no total.
- A leitura de SMS é persistida somente para IDs exibidos na conversa visível. Novas chegadas que não constam no recibo continuam não lidas. Recibos em lotes de até 200.
- A view de SMS resolve dono atual pelo buyer do membro, com fallback para assigned_to. A API valida sessão/escopo; a view é restrita ao service_role com security_invoker.
- SMS histórico permanece sem recibo de leitura e, portanto, pode aparecer como pendente. Não inventamos leitura retroativa nem alteramos registros históricos.
- Carregamento paginado da thread remove o teto anterior dos 200 primeiros SMS. Erros retornam indisponibilidade, não um falso sucesso vazio.

## Evidências locais
- TDD: testes novos falharam antes da implementação e passaram depois.
- Testes focados finais: 118 passaram, zero falhas (incluem regressões de Pipeline, horário/idiomas e WhatsApp).
- Migração 064 executada duas vezes em PostgreSQL local PGlite; verificados recibos, resolução de membro, fallback e privilégios da view.
- React real renderizado em teste: balão azul SMS, contagens por canal, zero oculto, limite visual 99+ com contagem acessível completa.
- Build completo: exit 0. Configuração preexistente do build pula checagem de tipos; tsc independente encontrou os mesmos 17 diagnósticos normalizados na base limpa e no código alterado, sem novos.
- Suíte completa executada uma vez: 743 testes, 739 passando, 4 falhas. Três incompatibilidades dos harnesses com os novos hooks/imports foram corrigidas e passaram na rodada focada final. A falha restante de automation-scheduling foi reproduzida na base limpa e não foi alterada.
- NÃO VERIFICADO: interface no navegador autenticado, tráfego real SMS e banco de produção. Não foi enviado SMS nem WhatsApp.

Logs locais: `/home/hermes/.hermes/profiles/diretor/cache/scratch/sms-verification/` (full-tests.log, focused-final.log, build.log, tsc-current.log, tsc-baseline.log).

## Publicação proposta — aguardar sim
1. Revalidar a base origin/main e colisão da numeração 064 antes de publicar.
2. Ler o schema real e confirmar compatibilidade da migration `064_sms_reply_unread.sql`.
3. Aplicar a migration autorizada antes do deploy: o código novo depende de read_at e da view.
4. Conferir por leitura schema, privilégios e query escopada; mesclar via PR apenas com autorização de publicação e check exigido aprovado.
5. Verificar o deploy exato e as contagens/recibos reais sem mandar mensagens a clientes. Envio de teste exige autorização separada.

Reversão proposta: reverter somente o deploy da aplicação; a coluna nullable e a view podem permanecer sem uso, preservando os recibos. Não executar rollback ou remover dados sem autorização.

## Fora do escopo
Não foram alterados envio/roteamento de SMS/WhatsApp, custos, sequências, automação de aniversário, jobs nem dados de produção. Falha antiga em automation-scheduling e diagnósticos TypeScript preexistentes permanecem separados deste trabalho.
