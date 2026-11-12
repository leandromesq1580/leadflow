# WhatsApp Cloud API — número final 2126

A opção `WA_CLOUD_AUTOMATION_ENABLED` migra para a API oficial os envios do final 2126 nas automações de WhatsApp e nas sequências tradicionais e com IA. O código reconhece esse remetente pelo telefone, pelos endereços documentados da bridge ou por `WA_CLOUD_LEGACY_BRIDGE_URL`, quando configurada. Ele também verifica o número associado ao Phone Number ID no Graph antes de enviar.

## Cadastro em coexistência

O final 2126 continua no WhatsApp Business do celular para atendimento manual. Vincule esse mesmo número à Cloud API pelo fluxo [Coexistência no Embedded Signup da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users). Preserve a conta existente no celular durante o cadastro.

1. Confirme que a linha pode enviar no aplicativo. Se houver uma restrição ativa, consulte o motivo e o processo de revisão aplicável no suporte do WhatsApp.
2. Abra o fluxo de coexistência oferecido por um Solution Partner ou Tech Provider habilitado pela Meta. Antes de vincular, confirme que a WABA ficará no portfólio empresarial da Lead4Pro e que o aplicativo da Lead4Pro poderá enviar diretamente pelo Graph e receber o campo `messages` dessa conta. O código usa o Graph da Meta e a assinatura do aplicativo Meta que entrega o webhook.
3. Informe o número existente e confirme que o fluxo da Meta reconheceu a conta do WhatsApp Business no celular. A pessoa com acesso ao aparelho confirma a vinculação no aplicativo, conforme as instruções exibidas. Dispositivos vinculados podem precisar ser reconectados. Verifique os usos atuais do final 2126, inclusive os avisos internos, antes de iniciar o vínculo.
4. Confirme que o Phone Number ID pertence à WABA selecionada e que o número exibido é o final 2126. Configure `WA_CLOUD_PHONE_NUMBER_ID`, `WA_CLOUD_WABA_ID` e `WA_CLOUD_GRAPH_VERSION` em ambiente servidor. Armazene o token de acesso com permissão `whatsapp_business_messaging`, o App Secret e o token de verificação em `WA_CLOUD_ACCESS_TOKEN`, `WA_CLOUD_APP_SECRET` e `WA_CLOUD_VERIFY_TOKEN`, no gerenciador de segredos da Vercel.
5. Após autorização, aplique a migration 078 e publique o código com os envios Cloud desativados. Configure o callback em `/api/webhook/whatsapp-cloud`, valide o desafio e assine o campo `messages` na WABA. Confirme um evento de entrada real do final 2126 e uma assinatura válida antes de ativar.
6. Teste com um contato autorizado e um único fluxo mapeado. Confira se a mesma conversa aparece no celular, se a equipe consegue responder manualmente e se o envio automático aparece no aparelho do destinatário. Confira também o WAMID, o status no CRM e o tratamento da resposta ou do STOP. A ativação e o envio real exigem autorização.

A integração registra envios oficiais e respostas de contatos com vínculo inequívoco no CRM. O histórico e as respostas manuais do celular ficam disponíveis no aplicativo. O Lead4Pro ignora eventos de sincronização de histórico e cópias de mensagens enviadas pelo app, para evitar tratar mensagens do próprio negócio como respostas de clientes.

Guias oficiais de [uso do mesmo número no app e na plataforma](https://whatsappbusiness.com/resources/resource-library/organize-whatsapp-inbox-meta-business-suite/), [onboarding](https://whatsappbusiness.com/resources/resource-library/api-onboarding/), [Embedded Signup](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup) e [política de mensagens](https://whatsappbusiness.com/policy/).

## Consentimento e modelos

Explique o propósito das mensagens antes de coletar o aceite do contato. O webhook registra opt-in explícito com `ACEITO RECEBER MENSAGENS`, `I AGREE TO RECEIVE MESSAGES` ou `ACEPTO RECIBIR MENSAJES`. Ele registra o pedido de descadastro por STOP e equivalentes em português, inglês e espanhol. O cadastro de um telefone ou uma mensagem recebida sem aceite explícito não autoriza uma sequência.

Cadastre em `wa_cloud_templates` somente modelos estáticos aprovados na WABA para o uso e idioma correspondentes. Os campos são `source_key`, `locale` (`pt`, `en`, `es`), `template_name`, `template_language` e `body` com o texto aprovado. As chaves de origem são:

- Automação — `automation:<automation_id>`.
- Sequência tradicional — `legacy:<sequence_id>:<step_order>`.
- Sequência com IA — `ai:<sequence_id>:<current_step>`. O contador começa em zero.

Um modelo mapeado é enviado com o texto aprovado. Revise o vínculo se o objetivo da automação mudar ou se uma etapa da sequência for substituída ou reordenada. Texto livre exige aceite explícito e uma mensagem recente do contato para o final 2126 dentro da janela da Meta. Use a categoria atribuída pela Meta ao conteúdo. A Meta restringe a entrega de modelos de marketing a números dos EUA. Confira a elegibilidade de cada fluxo antes de mapear o primeiro contato. [Limites de entrega da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits/)

## Corte e operação

- Ative `WA_CLOUD_AUTOMATION_ENABLED=true` somente depois de validar o callback e o primeiro fluxo. Para sequências, preserve a associação atual do remetente à conta proprietária no CRM, mesmo quando a sessão Web for retirada. O piloto exige lead da conta executora e retém leads delegados ou pertencentes a outra conta.
- O limite compartilhado é de seis reservas em quinze minutos, somando automações e sequências. As sequências mantêm também a cadência existente. Uma sequência sem permissão aguarda. Uma execução de automação retida fica registrada para revisão, sem replay automático do histórico.
- Confira `wa_cloud_dispatches` para distinguir aceite da API, entrega, falha e resultado desconhecido. A API pode aceitar a mensagem e a entrega falhar depois. Em resultado desconhecido, aguarde o webhook e reconcilie pelo ID da operação antes de decidir qualquer reenvio. A quarentena existente de sequência pode suspender novos envios pelo mesmo remetente até reconciliação.
- Respostas entram no CRM quando há correspondência inequívoca com um envio oficial para o contato e o lead continua com a mesma conta. Mensagens avulsas e respostas sem vínculo seguro atualizam a janela, sem atribuição a um lead. A equipe deve acompanhar essas conversas no canal de atendimento definido.
- O corte deste fluxo tem escopo de sequências e automações. O final 2126 também é usado em avisos internos, grupos e outros pontos do sistema. Defina o destino desses avisos antes da vinculação. Quando a Cloud API estiver validada, encerre o envio automatizado pelo WhatsApp Web para o 2126 no escopo migrado. Confira o atendimento manual pelo celular e a ausência de registros duplicados se o mesmo evento chegar também pela bridge.
