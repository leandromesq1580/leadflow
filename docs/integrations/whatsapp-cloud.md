# WhatsApp Cloud API — número final 2126

A opção `WA_CLOUD_AUTOMATION_ENABLED` migra para a API oficial os envios do final 2126 nas automações de WhatsApp e nas sequências tradicionais e com IA. O código reconhece esse remetente pelo telefone, pelos endereços documentados da bridge ou por `WA_CLOUD_LEGACY_BRIDGE_URL`, quando configurada. Ele também verifica o número associado ao Phone Number ID antes de enviar.

## Cadastro em coexistência com a Kapso

O final 2126 continua no WhatsApp Business do celular para atendimento manual. O cadastro vincula o número existente à Cloud API da Meta pelo fluxo de coexistência da Kapso.

1. Confirme que a linha pode enviar pelo aplicativo e atualize o WhatsApp Business. Se houver restrição ativa, consulte o motivo e o processo de revisão aplicável no WhatsApp.
2. Crie uma conta da empresa na Kapso. O plano Free inclui um número e 2.000 mensagens recebidas e enviadas por mês. O Pro custa US$ 25 por mês e permite configurar a retenção de conversas encerradas. O plano Free guarda o conteúdo sem prazo de expiração. As tarifas aplicáveis da Meta são separadas. [Planos](https://kapso.com/pricing) · [Retenção](https://docs.kapso.ai/docs/platform/whatsapp-data#retention)
3. Verifique o destino dos avisos internos que hoje saem pelo WhatsApp Web do 2126 antes de iniciar o vínculo. O cadastro de coexistência pode desvincular os dispositivos associados, inclusive a sessão da bridge. Coordene a confirmação do QR com quem tem o celular.
4. Na Kapso, abra **Connected numbers → Connect new number → WhatsApp Business App**. Na janela da Meta, informe o número existente com DDI +1, confira o perfil e selecione o portfólio empresarial da Lead4Pro. Quando a Meta apresentar o QR de coexistência, escaneie pelo aplicativo WhatsApp Business e confirme nele. Se o fluxo oferecer apenas verificação por SMS ou ligação, encerre e confira a opção selecionada na Kapso. [Passo a passo da Kapso](https://docs.kapso.ai/docs/how-to/whatsapp/connect-whatsapp#whatsapp-business-app)
5. Na etapa de compartilhamento do histórico, escolha **Don’t share chats** para limitar o acesso da Kapso a partir do vínculo. A equipe continua consultando o histórico anterior pelo celular. Revise as permissões solicitadas e termine o cadastro. Se for preciso habilitar cobrança, confira a opção de pagar a Meta diretamente. Vincular uma linha de crédito da Kapso pode exigir migração para trocar o modo de pagamento depois. [Cobrança](https://docs.kapso.ai/docs/whatsapp/meta-message-billing)
6. Confirme **Connected platform** no celular, o status do número na Kapso e os identificadores **WABA ID** e **Phone Number ID**. Confirme que a equipe ainda consegue receber e responder mensagens no aparelho.

A integração registra envios oficiais e respostas de contatos com vínculo inequívoco no CRM. As respostas manuais do celular ficam disponíveis no aplicativo. Eventos de sincronização e cópias de mensagens enviadas pelo negócio não contam como respostas de clientes. [Coexistência da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) · [Uso do mesmo número no app e na plataforma](https://whatsappbusiness.com/resources/resource-library/organize-whatsapp-inbox-meta-business-suite/)

## Configuração do Lead4Pro

1. Após autorização, aplique a migration 078 e publique o código com os envios Cloud desativados.
2. Configure `WA_CLOUD_PROVIDER=kapso`, `WA_CLOUD_PHONE_NUMBER_ID`, `WA_CLOUD_WABA_ID` e `WA_CLOUD_GRAPH_VERSION`. A documentação do proxy da Kapso exemplifica `v24.0`. Armazene a chave do projeto e o segredo do webhook em `WA_CLOUD_KAPSO_API_KEY` e `WA_CLOUD_KAPSO_WEBHOOK_SECRET` no gerenciador de segredos da Vercel.
3. Na Kapso, configure um webhook do tipo **Meta** para o número final 2126, com o mesmo segredo de verificação e a URL HTTPS do Lead4Pro em `/api/webhook/whatsapp-cloud`. Esse tipo encaminha o payload da Meta com assinatura da Kapso. Confirme uma entrada real com assinatura válida antes de ativar envios. [Webhooks da Kapso](https://docs.kapso.ai/docs/platform/webhooks/overview#meta-webhooks)
4. Com autorização para envio real, teste um contato autorizado e um único fluxo mapeado. Verifique o WAMID, a entrega no aparelho, a resposta manual pelo celular, o status no CRM e o tratamento da resposta ou do STOP.

Para uma conexão direta com a Meta, use `WA_CLOUD_PROVIDER=meta`, os mesmos IDs e versão, `WA_CLOUD_ACCESS_TOKEN`, `WA_CLOUD_APP_SECRET` e `WA_CLOUD_VERIFY_TOKEN`. Valide o desafio no callback e assine o campo `messages` na WABA. [API oficial da Meta](https://www.postman.com/meta/whatsapp-business-platform/overview)

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
