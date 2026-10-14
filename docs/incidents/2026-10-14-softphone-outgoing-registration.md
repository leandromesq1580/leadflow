# Ativação do telefone bloqueava chamadas de saída

Data: 2026-10-14
Base: `f4c47842af3fda85866cb800a6ac57291b714052`

## Evidência e limites

- O alerta recebido foi: “Não consegui conectar o telefone. Verifique a permissão de microfone do navegador e tente de novo.”
- Na base, esse texto só era escolhido após rejeição de `device.register()` em `softphone-activation.ts`. A operação habilita recebimento; não testa a permissão do microfone.
- Não temos a exceção específica produzida no navegador afetado. A causa dessa rejeição (credencial, rede etc.) permanece **NÃO VERIFICADA**.
- Teste local isolado com registro de recebimento recusado: saída era bloqueada antes de `connect()`. A mesma fixture chega ao transporte de saída após a correção. Não houve chamada real.
- Documentação Twilio: https://www.twilio.com/docs/voice/sdks/javascript/twiliodevice — `connect()` abre sinalização para saída; `register()` habilita recebimento. O componente não possui atendimento de chamadas recebidas.

## Correção delimitada

- Preparação de saída não chama `register()` nem depende do evento `registered`.
- Cliques durante preparação ainda compartilham uma ativação; falha de preparação permite nova tentativa.
- Falha de saída não fica silenciosa: distingue permissão de áudio, autorização, conexão e erro desconhecido pelo código do SDK. Só código numérico e categoria vão ao novo aviso/log; mensagens arbitrárias não são copiadas.
- Rejeição de autorização descarta o telefone/token antigo; só outro clique busca nova autorização. Sem rediscagem automática.
- Ajuste único pós-revisão (R1): cada clique renova a autorização, compartilhando a requisição pendente e preservando a instância. Não depende de tokenWillExpire antes da primeira sinalização. Device.error fornece só seu código à rejeição sem argumento da mesma tentativa; isso permite descartar a autorização recusada e tentar novamente apenas no próximo clique.
- A revisão independente avaliou `69a132b4c2ebc3f5976ed8ab1163cf0edef7ce5c`, reprovou R1 e não cobre o delta corretivo posterior. Delta conferido pelo agente principal, com testes RED no SHA revisado → GREEN no SHA final. Mudança na preparação compartilhada entre cliques, sem SQL; essa limitação precisa constar no pedido de publicação.
- Preexistências fora do escopo: listener de l4p:call fecha sobre status antigo (risco de segundo clique durante chamada) e limpeza de ativações pendentes durante desmontagem/remontagem. Não são reivindicadas como corrigidas nesta entrega.
- Ajuste adicional autorizado pelo dono em 14/10 após a rodada R1: corrigida a inferência de null na leitura da ref após await usando função de leitura e guarda explícita. Sem cast, sem desabilitar checagem e sem mudar a política de recuperação. Logs RED de tipos e GREEN focado preservados em `extra-types-round/`; a verificação final se vincula ao commit deste ajuste.
- Nenhuma alteração de credenciais, banco, roteamento, gravação ou destinatário.

## Verificação

`tests/softphone-outgoing.test.ts`: base RED → candidato GREEN com transporte sintético.
`tests/softphone-component.test.ts`: componente real compilado, IO/browser/React isolados; base falha e candidato passa. Não é teste de WebRTC nem do navegador da cliente.
`tests/softphone-errors.test.ts`: classificação conservadora e proteção contra exibição de texto arbitrário.
`tests/softphone-activation.test.ts`: ativação compartilhada, recuperação e desmontagem.
`tests/voice-routing.test.cjs`: roteamento e autenticação da rota preservados.

Publicação não equivale a comprovação de ligação: conexão real/áudio no computador afetado precisam de confirmação após release, sem chamada automática a cliente.
