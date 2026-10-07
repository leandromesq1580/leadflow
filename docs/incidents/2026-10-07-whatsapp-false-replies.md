# Falsos alertas de resposta do WhatsApp

## Sintoma e causa

Eventos técnicos como `e2e_notification`, recebidos junto a um envio do próprio usuário, eram persistidos como mensagens recebidas vazias. A contagem considerava apenas direção e leitura; a conversa também mostrava um balão sem conteúdo, somente horário. Evidência bruta sanitizada desta investigação: log de canal `[IN] [phone] e2e_notification text name=-` correlacionado aos registros vazios e envios dos dois cards reportados. A correlação temporal completa depende dos timestamps do banco porque a linha de log não tem timestamp próprio.

## Correção

- Descartar eventos técnicos antes de criar cliente de banco, salvar, notificar ou interromper sequências.
- Desconsiderar eco com identificador próprio `true_` quando indevidamente apresentado como recebido.
- Excluir registros sem texto nem metadados de mídia dos contadores, resumo e visualização de conversa, em leads e clientes administrativos.
- Preservar envios reais no histórico, sem contá-los como respostas; preservar texto, emoji, áudio/mídia sem download, contato e localização.
- Paginar contagens e leitura por identificador até página vazia, inclusive quando o servidor limita a página abaixo do solicitado.
- Validar identidade no endpoint de contagem.

A limpeza é de leitura/apresentação: nenhum DELETE, nenhuma alteração de `read_at`, nenhuma migration. Registros antigos permanecem disponíveis para recuperação e auditoria. Não reativar automaticamente sequências anteriormente interrompidas. Não apagar acompanhamentos/agendamentos: são atividades distintas da notificação de resposta. Tipo técnico antigo com texto não pode ser identificado com certeza se seu tipo não foi persistido; não adivinhar nem apagar textos reais.

## Regressões cobertas — 2026-10-07

- Mídia sem flag de download: teste RED reproduziu `null !== 'ptt'`; normalização preserva ptt/image/location/vcard.
- Datas nulas legadas não podem quebrar a ordenação de conversas. Falha na consulta de cadastro deve retornar indisponibilidade, não uma lista vazia bem-sucedida.
- A ordenação do funil usa mensagem válida, não o horário de eventos técnicos/eco próprio; procura a anterior por páginas quando necessário, preservando autorização e limite de trabalho.
- Falha na consulta de não-lidas preserva a última contagem válida; indisponibilidade não equivale a zero nem a “Tudo em dia”.
- R3: paginar mensagens não basta. As consultas de cadastros (`leads` e `buyers`) também podem ser truncadas pelo servidor. Reprodução original retornou uma conversa quando duas eram esperadas em ambas as listas. O helper `readConversationMetadata` divide identificadores em blocos de até 100, lê cada bloco por ID ascendente até vazio, sem encerrar em página curta. Falha, repetição de cursor ou retorno fora do bloco abortam sem resposta parcial; cadastro realmente removido continua omitido.
- Regressão R3 cobre teto de servidor menor que a página, 205 cadastros, falha na segunda página e em bloco posterior, ausência real e cursor sem progresso. Em 07/10 às 15:17 UTC a reprodução original retornou `expectedConversations: 2, actualConversations: 2` em ambas as rotas; verificação dos 16 arquivos TypeScript alterados: 0 erros, lint comparado à base: 39 anteriores/34 atuais/0 novos.

Resultados de build, suite geral e aprovação precisam corresponder ao snapshot exato em revisão. Logs RED/GREEN e relatórios desta investigação estão em `reply-continuity-20261007` no scratch do perfil; resultados antigos não aprovam alterações posteriores. O build ignora validação semântica por configuração histórica: executar TypeScript separado. Testes locais não comprovam entrega de mensagens nem comportamento em produção.

## Publicação

NÃO PUBLICADO. Necessita confirmação explícita de publicação pelo proprietário, PR/revisão e verificações obrigatórias na ponta exata; depois verificar domínio, versão e comportamento ao vivo. Não necessita reinício dos canais nem alteração de dados/credenciais. Os testes locais não comprovam comportamento em produção.
