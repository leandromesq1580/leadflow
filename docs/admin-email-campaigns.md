# Campanhas de e-mail do admin

## Escopo e operação

Página: `/admin/email-campaigns` (atalho no menu do admin).
Campanhas avulsas sobre seguro para a base completa, incluindo leads atribuídos a clientes, sem alterar comprador, créditos ou sequências. O remetente exibido é **Lead4Pro**; conteúdo em português e espanhol conforme idioma efetivo do lead. Não substitui o módulo de sequências nem os e-mails manuais dos clientes.

Fluxo: criar → escrever nos dois idiomas → salvar rascunho → conferir público → registrar permissão documentada quando aplicável → confirmar conteúdo/público → agendar. Toda gravação de permissão é uma declaração explícita do admin com referência e histórico; a migração **não concede consentimento** a ninguém. Quem pediu descadastro não é reativado por essa declaração.

Seleção padrão: todos os leads. Filtros opcionais por cliente, estados, idioma, tipo (quente/frio) e período UTC. Uma campanha considera todos os cadastros selecionados, mas só inclui um endereço por campanha. A prévia explica ausentes, inválidos, repetidos, idioma ausente/conflitante, descadastro/bloqueio e permissão ausente. Idiomas conflitantes para um mesmo endereço são bloqueados mesmo quando um filtro tenta esconder um dos registros. Formulários conhecidos seguem `META_FORM_LANGUAGES`, como as demais notificações.

Ao agendar, conteúdo, público e destinatários ficam congelados. A contagem confirmada é conferida dentro da mesma transação que cria a fila; mudança de contagem devolve conflito e exige nova prévia. Novos leads não entram numa campanha já agendada. São incluídos numa campanha posterior.

Pausa/cancelamento impedem novos envios autorizados. Um e-mail que já estava autorizado e em andamento pode terminar: não existe desfazer um envio. Resultados incertos não são automaticamente repetidos. Cancelamento preserva histórico. Permissão e bloqueio são conferidos novamente antes do envio, inclusive depois do agendamento.

## Hyperlink do WhatsApp no conteúdo

O editor continua aceitando texto simples e o endereço `https://wa.me/...`. No HTML enviado e nas prévias do gerador e do rascunho, o endereço fica escondido por **clique aqui para falar comigo** (PT) ou **haz clic aquí para hablar conmigo** (ES). Número e mensagem pré-preenchida são preservados literalmente; nenhum contato é substituído pelo número padrão durante essa formatação. Apenas domínio HTTPS `wa.me`, sem usuário/senha e com caminho de telefone válido, recebe o rótulo. Outros links continuam visíveis com o próprio endereço.

`src/lib/email-campaign-content.ts` é a fonte única dessa apresentação. Textos legados continuam escapados; corpos ricos usam a sanitização de `email-campaign-rich.ts`, descrita abaixo. Filtros, filas, remetente, consentimento, rodapé e descadastro não mudam. A versão alternativa de texto simples conserva os destinos para leitores sem HTML. A mudança vale para futuros envios; não altera e-mails já entregues e não reenvia nada.

Teste de regressão: `tests/email-campaign-hyperlink.test.ts`; UI real local com API sintética: `tests/email-campaign-ai.ui.mjs`. Não é necessária migration, variável nova nem envio real de teste.

## Nova ideia por clique e hyperlink no rascunho

O tipo inicial é **Seguro de vida**, editável pelo admin. Cada clique envia `variation` (inteiro 0–10.000) e até três sugestões editoriais anteriores em `previous`, sem URLs/telefone. A aplicação alterna seis abordagens: curiosidade, cotidiano, objeção, planejamento, mudança de fase e clareza antes de contratar. Produto e intenção comercial continuam no briefing. Seguro de vida escolhido exige menção ao produto nos dois corpos; não basta uma reflexão genérica.

Antes de devolver outra versão, a aplicação recusa corpo idêntico, abertura idêntica ou sobreposição de pelo menos 75% dos pares de palavras contra as últimas três sugestões, em qualquer idioma. Uma tentativa limitada de reescrita, dentro do mesmo prazo, continua sendo o teto. A guarda não prova novidade semântica nem qualidade persuasiva: a rubrica com gerações reais segue obrigatória. Em falha, a sugestão anterior e o rascunho continuam disponíveis. Mudança do tipo/tema/contato limpa o histórico editorial local; não existe cache de textos de clientes. O teto HTTP é 16 KiB para acomodar o histórico limitado.

O corpo do rascunho agora é um editor de texto com hyperlinks nomeados, não uma textarea que mostra o endereço cru. Aplicar, editar, mudar idioma, copiar, recortar, desfazer, salvar e reabrir preservam o destino literal. Cópia/recorte usam representação canônica e colagem segura participa da transação nativa de edição, sem aceitar HTML da área de transferência. Perder foco não redesenha o DOM: seleção é restaurada ao retornar e o histórico de desfazer é preservado. O limite de colagem desconta o trecho selecionado que será substituído. A representação legada de texto simples conserva a URL; depois de usar um comando de formatação, o documento rico mantém o texto do link e seu destino no HTML sanitizado. Links protegidos não são editados por dentro; o link inteiro pode ser removido ou alterado na opção HTML. Colagem aceita somente texto; arrastar HTML é bloqueado. A edição HTML explícita é sanitizada, sem envio automático e sem alteração do banco de produção durante os testes.

Regressões: `tests/email-campaign-new-idea.test.ts`, `tests/email-campaign-draft-link.test.ts`, `tests/email-campaign-ai.ui.mjs` (página/editor/CSS reais com respostas de IA sintéticas) e `tests/email-campaigns.ui.mjs` (salvar/reabrir pelo handler real e PostgreSQL local, esquema 062 + 063). Os testes locais não comprovam resposta futura do provedor nem entrega de e-mail.

## Editor rico: negrito, links e imagens (migration 064)

A barra do corpo oferece **B**, *I*, **Link**, **Imagem** e **</>** nos dois idiomas. Selecione palavras e use B/I (ou Ctrl/Cmd+B/I); Link pede o texto e o destino, e Ctrl/Cmd+K abre esse controle. A opção HTML permite editar uma estrutura limitada: parágrafos, negrito, itálico, sublinhado, listas, títulos, links HTTP(S) e imagens HTTPS. Código ativo, embeds, SVG/data/file URLs, eventos e CSS arbitrário são removidos na entrada, na validação do servidor e no envio/prévia. HTML arbitrário sem marcador de documento rico continua rejeitado pela API. `{{nome}}` só aceita nome escapado no HTML; texto alternativo de envio é gerado sem tags.

O formato rico usa o prefixo interno `<!--lead4pro-rich:v1-->` nos campos de corpo existentes (até 20.000 caracteres incluindo HTML); não há mudança de esquema das campanhas nem reescrita dos rascunhos antigos. Textos legados/IA continuam renderizados e editáveis. Salvar e reabrir mantém formatação e destinos. Rodapé, descadastro, consentimento, filtros e filas permanecem na mesma lógica. Aplicar outra sugestão de IA substitui o corpo após confirmação, inclusive a formatação/imagem anterior; não agenda ou envia.

Imagem pode vir por URL HTTPS ou upload de **JPG, PNG, WEBP/GIF, até 3 MB**, com descrição acessível. Upload exclusivo de admin em `POST /api/admin/email-campaigns/images`: identidade de campanhas, origem conferida, tamanho e assinatura binária compatíveis com o MIME, caminho aleatório por admin e `upsert=false`. Não processa SVG nem aceita HTML renomeado como imagem. Enquanto o arquivo sobe, salvar, trocar idioma/campanha e outros comandos ficam bloqueados; só insere depois de liberar o editor. Falha preserva o corpo.

A migration **064_campaign_rich_images.sql** cria somente o bucket público `campaign-images` (obrigatório para carregar arte nos e-mails), limite 3 MB e quatro tipos de imagem. Não altera `lead-attachments`, gravações, leads, contatos, créditos ou permissões de envio. Políticas restritivas proíbem insert/update/delete direto por anon/authenticated mesmo se existir política ampla; gravação só via API admin usando service_role. **Imagens carregadas são públicas**: a tela avisa para nunca usar documentos/fotos privados de clientes. Não há exclusão automática de arquivos: uma imagem já referenciada por e-mail deve continuar acessível. Não exige chave/variável nova. Aplicar migration antes do merge/deploy autorizado.

Regressões: `email-campaign-rich.test.ts`, `email-campaign-images.test.ts`, `email-campaign-rich-sql.test.ts` (PostgreSQL em PGlite), `email-campaign-rich.ui.mjs` (React + handlers HTTP reais + SQL isolado, arquivos/armazenamento sintéticos). UI verifica negrito, links, HTML seguro, imagem por URL/upload, bloqueio durante upload, PT/ES, salvar/reabrir, prévia/envio offline e desktop/mobile/dark. Sem acesso/armazenamento de produção e nenhum e-mail real.

## Configuração antes de produção

Migração: `supabase/migrations/062_admin_email_campaigns.sql`. Cria tabelas e funções novas; **não reescreve nem remove leads, compradores, créditos ou permissões existentes**. Tabelas com RLS e sem acesso direto de anon/authenticated. Funções novas revogadas de PUBLIC/anon/authenticated, concedidas só a service_role. As APIs admin conferem a identidade autenticada exata por `buyers.auth_user_id` e passam o `buyers.id` para as funções SQL, sem herdar permissão do responsável de uma equipe. As referências a leads e compradores novos usam `ON DELETE SET NULL`: exclusões existentes preservam o histórico da campanha, sem impedir a operação. Um lead removido ou com endereço alterado não é enviado pela fila congelada.

| Variável | Uso |
|---|---|
| `RESEND_API_KEY` | Chave do provedor existente; precisa permitir consultar os domínios e enviar |
| `EMAIL_CAMPAIGNS_FROM_EMAIL` | Remetente exclusivo das campanhas em domínio próprio autenticado; não altera os avisos do sistema. `resend.dev` é bloqueado |
| `RESEND_FROM_EMAIL` | Remetente compartilhado dos avisos; usado nas campanhas apenas se `EMAIL_CAMPAIGNS_FROM_EMAIL` estiver ausente ou vazio, para compatibilidade |
| `MANUAL_EMAIL_POSTAL_ADDRESS` | Endereço postal obrigatório no rodapé (10–500 caracteres) |
| `EMAIL_CAMPAIGN_WEBHOOK_SECRET` | Assinatura do endpoint dedicado de retornos |
| `EMAIL_CAMPAIGNS_ENABLED` | Somente `true` libera agendamento/envio; ausente = bloqueado |
| `EMAIL_CAMPAIGN_DAILY_LIMIT` | Teto global por dia UTC; padrão conservador 200; intervalo 1–10.000 |
| `CRON_SECRET` | Autorização Bearer do agendador Vercel; sem valor não executa |

Agendador declarado em `vercel.json`: `/api/cron/email-campaigns`, uma vez por minuto. Mesmo com execuções sobrepostas, o banco reserva no máximo 10 contatos por minuto e respeita o teto diário compartilhado entre todas as campanhas. Reservas consomem capacidade conservadoramente. Não aumenta automaticamente o limite do plano do provedor.

O domínio é consultado no provedor e precisa estar verificado tanto no agendamento quanto no processamento. Nada de usar remetente de teste. O módulo pode ser publicado com disparos desativados, mantendo rascunhos e prévias disponíveis.

Cadastrar no provedor o endpoint `https://lead4producers.com/api/email-campaigns/webhook` para `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`. Assinatura e timestamp são verificados pelo SDK oficial sobre o corpo bruto; sem assinatura válida nada é gravado. Retornos repetidos e fora de ordem são suportados, inclusive retorno que chega antes da resposta ao envio. O envio leva as tags `module=admin_insurance_campaigns` e `recipient=<id>`; apenas eventos assinados com essas tags e destinatário autorizado entram no histórico. Eventos de e-mails manuais, sequências e outros sistemas são ignorados. Não guarda o corpo bruto nem os links/endereço do evento. Bounce/reclamação/bloqueio bloqueiam o endereço globalmente **neste módulo**.

Descadastro: `/api/email-campaigns/unsubscribe/<token-opaco>`. GET só confirma visualmente (não muda dados, para evitar scanners); POST confirma o descadastro. Cabeçalhos RFC 8058 permitem descadastro de um clique pelos provedores. A resposta não revela o endereço. O descadastro é imediato no contato global; a fila pendente é marcada como bloqueada pelo próximo processamento, sob a mesma ordem de travas da fila. Isso evita contato→destinatário invertido em relação à autorização. A última verificação antes de enviar consulta o bloqueio mesmo se a fila ainda não foi atualizada. O descadastro vale para futuras campanhas do admin, inclusive em outras campanhas/clientes; não modifica sequências transacionais/manuais dos clientes.

Aberturas e cliques dependem do rastreamento habilitado no domínio. Aberturas são estimativas por causa de mecanismos de privacidade. `aceito pelo provedor` não é `entregue`; a tela e o histórico distinguem isso. `processada` significa que não há fila ativa, não que todos receberam.

## Resultados, filtros e reenvio (migration 063)

Migração: `supabase/migrations/063_email_campaign_tracking_resend.sql`. Adiciona o registro do rastreamento no momento do agendamento (`tracking_snapshot`), o vínculo `resend_of`, os filtros de engajamento na lista de contatos e as funções `ec_resend_preview` / `ec_resend_create`. Não altera leads, compradores, créditos nem permissões; campanhas anteriores continuam legíveis.

Métricas do painel **Resultados**: *Enviados* são aceitos pelo provedor (não é entrega); *Entregues* são confirmados pelo provedor e são a base das porcentagens. *Aberturas únicas* e *Cliques únicos* contam **uma vez por contato**, são estimativas e só aparecem quando a campanha foi agendada com rastreamento registrado como ativo naquele momento; caso contrário a célula mostra `—` e “rastreamento não ativo nesta campanha”. *Sem abertura registrada* = entregues sem abertura nem clique. Campanhas anteriores à migration 063 não têm registro de rastreamento: aberturas, “sem abertura” e reenvio ficam indisponíveis para elas, e isso não pode ser inferido depois. *Cliques* contam **qualquer link do e-mail detectado pelo provedor, inclusive o rodapé de descadastro**, e filtros automáticos/scanners de segurança podem contar cliques que ninguém fez; a tela diz isso na própria métrica. Um clique **não** comprova conversa no WhatsApp nem interesse no CTA. Os números não atualizam sozinhos: use **Atualizar**.

Filtro de contatos (“Filtrar contatos por engajamento”): todos, sem abertura registrada, abriram, clicaram, entregues, aceitos, falhas, na fila, bloqueados, incertos. É aplicado no SQL, com total exato e paginação de 50.

Reenvio (“Preparar reenvio” → “Criar rascunho do reenvio”): só para campanha **concluída, original (não reenvio) e com registro de rastreamento de abertura ativo no agendamento**; no máximo **um** reenvio por origem (criação concorrente devolve o mesmo rascunho). A prévia lista quem entra e por que cada um fica de fora: abriu, clicou, entregue há menos de 48 h, não entregue, bloqueado/descadastrado/sem permissão. O rascunho nasce com os textos da origem, sem destinatários e sem envio: nada sai até o admin revisar e agendar. Criar e agendar um reenvio exigem o rastreamento de abertura confirmado **no provedor naquele instante** (resposta 409 caso contrário); a lista congelada no agendamento é o público original filtrado, e quem abrir ou clicar entre a prévia e o envio é retirado automaticamente. Consentimento e bloqueio são conferidos de novo antes de cada envio, como em qualquer campanha. Campanhas antigas (sem registro) e reenvios de reenvio são bloqueados com a razão exibida.

### Rastreamento conferido de novo antes de cada envio (pausa automática)

O registro feito no agendamento (`tracking_snapshot`) é uma promessa: “abertura/clique rastreados desde o primeiro envio”. Como o agendamento aceita até 366 dias no futuro e o rastreamento pode ser desligado no painel do provedor (ou o CNAME removido) nesse intervalo, o worker lê o status do provedor **uma vez por rodada**, antes da primeira reserva, e entrega essa leitura normalizada a `ec_claim(p_daily, p_tracking)`. Dentro da mesma trava da campanha, antes de reservar qualquer contato, `ec_claim`:

- compara o que o registro prometeu (`open=true`, e `click=true` quando prometido) com a leitura atual (`status='verified'` e a mesma flag `true`);
- para um **reenvio**, exige sempre abertura confirmada agora, além das flags da origem;
- se não confirmar (desligado, não verificado, desconhecido, provedor indisponível ou leitura ausente), **pausa a campanha** com `pause_reason='tracking_not_confirmed'`, grava auditoria (`action='pause'`, sem ator, com o prometido e o atual) e **não envia nada** naquela rodada. Registro, contatos, histórico, aceites, ids do provedor e chaves de idempotência ficam intocados.

Campanhas antigas (sem registro) ou agendadas com rastreamento desligado/desconhecido não prometem nada e seguem enviando normalmente, qualquer que seja a leitura atual; elas continuam inelegíveis para reenvio.

Na tela, a campanha pausada mostra o motivo em português; **o que fazer**: conferir o rastreamento no painel do provedor (subdomínio + CNAME verificado + abertura/clique ligados) e usar **Retomar**. Retomar limpa o motivo e devolve a campanha à fila; a rodada seguinte confere de novo e volta a pausar se ainda não estiver confirmado. Não há retomada automática. Chamadas antigas de `ec_claim` só com o limite diário continuam válidas (leitura ausente = pausa apenas para campanhas que prometeram rastreamento ou reenvios).


### Pré-requisito no Resend: rastreamento efetivo, não só a chave ligada

Segundo a documentação do provedor (`resend.com/docs/dashboard/domains/tracking`), abertura e clique **só ficam ativos depois** que o domínio tem um subdomínio de rastreamento definido e o registro **Tracking (CNAME)** correspondente está **verificado** no DNS. As chaves `open_tracking`/`click_tracking` sozinhas não provam nada. Por isso a aplicação (`effectiveTracking`, em `src/lib/email-campaign-provider.ts`) só considera o rastreamento confirmado quando, na mesma resposta do provedor: o nome do domínio é o configurado, o status de envio é `verified`, `tracking_subdomain` existe (até 253 caracteres, nome válido) e há um registro `Tracking`/`CNAME`/`verified` cujo nome coincide com esse subdomínio. Qualquer resposta incompleta, para outro domínio, com registro pendente/não iniciado ou sem subdomínio resulta em `not_verified`/`unknown` (falha fechada) com apenas a causa (`tracking_dns_not_verified`, `domain_mismatch`, `incomplete_response`); nomes e valores dos registros nunca saem do servidor.

Configuração a fazer no painel do Resend, pelo responsável: definir o subdomínio de rastreamento do domínio de envio, publicar o CNAME indicado no DNS, aguardar a verificação e então habilitar abertura e clique. Nenhuma variável de ambiente ou chave nova. Enquanto isso não estiver verificado, o editor de **nova** campanha mostra um aviso antes do primeiro agendamento (“rastreamento de abertura e clique não confirmado…”), **sem bloquear** o agendamento nem alterar as flags de envio: a campanha sai, mas aberturas/cliques não serão contados e o reenvio dela ficará indisponível. O único bloqueio é o do reenvio. Este documento descreve o que o código confere; não afirma que o rastreamento está ativo em produção — isso só a leitura do provedor, no momento do agendamento, pode dizer.

## Verificação local (sem .env, credenciais nem mensagens reais)

- `node --import tsx --test tests/email-campaigns*.test.ts`: seleção, consentimento, isolamento, transições, filas, retornos e endpoints com injeção controlada.
- `tests/email-campaigns.pg.mjs`: PostgreSQL 16 **local**, multissessão, socket Unix obrigatório. 20 workers concorrentes, quota global, tempo da reserva após trava, pausa × autorização, descadastro × autorização, finalização × expiração e envio em andamento.
- `tests/email-campaigns.ui.mjs`: página React real + handlers HTTP reais + SQL local com contatos sintéticos; provedor e autenticação injetados. Criação, falha de salvamento sem perder texto, consentimento, preview, agendamento, pausa/retomada/cancelamento, histórico, configuração bloqueada e layout em 1280 px / 390 px. Nenhuma chamada de envio ao provedor.
- `tests/email-campaign-resend-api.test.ts`, `tests/email-campaign-resend-sql.test.ts`, `tests/email-campaign-tracking-worker.test.ts` (worker real + SQL real em PGlite: pausa antes de qualquer envio quando o rastreamento prometido não se confirma, leitura única por rodada, campanhas legadas intocadas, reenvio pausado) e `tests/email-campaign-resend.ui.mjs`: métricas, filtros, prévia/criação do reenvio (inclusive criação concorrente e bloqueio 409 com rastreamento desligado), leitura do provedor com DNS de rastreamento ausente/pendente/verificado/outro domínio, aviso antes do primeiro agendamento e relatório em tema escuro/mobile. O fixture do provedor é sintético; nenhum domínio real é consultado.

`email-campaign-resend-sql.test.ts` e `email-campaign-tracking-worker.test.ts` usam PGlite em processo (sem socket) e rodam no `npm test` padrão. Para as rotinas com PostgreSQL local (`*.pg.mjs`, `*.ui.mjs`): `EC_TEST_SOCKET` aponta para o socket Unix do PostgreSQL local na porta 55432; `EC_TEST_TOOL_DIR` aponta para um pacote de verificação com `pg` e `playwright`. A rotina de UI também exige `EC_TEST_OUTPUT` para artefatos. O navegador Chromium de teste precisa estar instalado localmente; nenhum desses utilitários vira dependência do aplicativo. Bases locais sintéticas são preservadas para auditoria; as rotinas não removem dados.

Limites da verificação: UI testada isoladamente com identidade admin injetada, não com login de produção. Entrega real, autenticação do domínio real, plano/quota do provedor e evento real ainda precisam de configuração e autorização. Não enviar um teste real à base.

## Apoio de IA no editor

O controle **Gerar com IA**, disponível apenas em rascunhos, produz nome sugerido, assuntos e textos PT/ES. O objetivo é iniciar uma conversa para saber mais ou pedir uma cotação, com um único destino de WhatsApp. O contato inicial é `1 786 744 2126`; o link é construído pela aplicação (`https://wa.me/17867442126`), não escolhido pelo modelo. O administrador pode ajustar tipo de seguro, orientação geral e contato antes de gerar.

Geração → prévia dos dois idiomas → **Usar textos no rascunho** → revisão/edição → salvamento explícito. Gerar não grava campanha, destinatário, permissão, fila ou evento; não envia e-mail e não agenda. Aplicar substitui somente assunto/corpo dos dois idiomas e preenche o nome apenas se estiver vazio; filtros, nome existente e permissões são preservados. Se há conteúdo, exige confirmação de substituição. Campanhas congeladas não oferecem a geração. Trocar a campanha descarta sugestões pendentes e aborta a requisição do editor anterior. Erros preservam o rascunho.

`POST /api/admin/email-campaigns/generate`: mesma autenticação exata de admin de campanhas; origem externa recusada; JSON limitado a 4 KiB. Corpo `{insurance, theme, phone}`; responde `{copy:{name,subject_pt,body_pt,subject_es,body_es}}`. `OPENAI_API_KEY` existente, modelo `gpt-4o-mini`, uma chamada por clique, até 1.000 tokens de saída e 20 s de limite. Sem nova variável nem migration. A chave nunca chega ao navegador. Não registra prompts, respostas rejeitadas ou detalhes do provedor nos logs. Há guarda de rajada de 6 gerações por minuto por admin e instância; **não é quota global nem limite de gastos entre instâncias serverless**. O consumo de IA continua sujeito ao limite da conta OpenAI.

Somente tipo de seguro e orientação geral vão ao modelo; nem o WhatsApp comercial nem dados da base são consultados/enviados. A UI pede para não incluir dados de pessoas e o filtro recusa contatos/atribuições pessoais reconhecíveis. É uma proteção lexical, **não anonimização universal**. O tema fica no JSON de usuário subordinado às regras fixas. Saída malformada/truncada, HTML, links, contatos escolhidos pelo modelo, números e alegações promocionais reconhecíveis são recusados. Se o tipo é genérico, não aceita que o modelo invente uma categoria como seguro residencial. Regras e filtros reduzem risco: **o admin ainda precisa conferir fatos, idioma, tipo de seguro e destino antes de aprovar**; não são uma revisão jurídica automática.

Verificação focada: `node --import tsx --test tests/email-campaign-ai*.test.ts`. A geração real pode ser conferida com brief comercial genérico, sem dados de lead, sem gravar campanha e sem enviar mensagem. A UI é exercitada em harness loopback com o componente/CSS reais e respostas HTTP explicitamente sintéticas, em desktop/mobile/tema escuro. Teste local não comprova login ou uso em produção.

## Fora da primeira versão

Fluxos condicionais/automáticos, editor visual HTML, cadência individual de retentativa de rejeitados, liberação automática de resultado incerto, testes A/B e envio em nome de cada corretor. O teto diário é configuração de operação, não decisão de envio automático por custo. Nenhuma contagem ou estimativa de custo da base de produção foi inferida a partir das fixtures.
