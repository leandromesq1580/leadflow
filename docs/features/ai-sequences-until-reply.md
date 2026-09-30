# Sequências IA WhatsApp até resposta

## Apresentação personalizada — publicação autorizada em 29/09/2026

Campo opcional **Como você gosta de se apresentar?**, na aba Mensagem, persistido como `ai_config.presentation` por sequência do comprador. Aceita até 300 caracteres; omitido vira string vazia e espaços externos são removidos. Não cria preferência global nem altera outras sequências. `save_sequence` já armazena o JSONB inteiro; nenhuma nova migration ou credencial é necessária.

A sugestão é referência de abordagem/abertura, não texto fixo: segue separada das instruções de sistema, como dado não confiável, para o mesmo gerador da prévia e do envio programado. Pode incluir o nome profissional do remetente em uma apresentação explícita (por exemplo, “Oi, sou Ana, agente de life insurance.”), nunca dados dos leads, contatos ou credenciais. A IA é instruída a adaptar ao idioma, escrever em primeira pessoa em nome do agente e não inventar identidade ou contato anterior. Não há prefixo fixo de assistente virtual. Vocabulário comercial em português: agente de life insurance, não corretor/corretora.

A edição invalida prévias anteriores; falha ao salvar/gerar mantém o rascunho. Configurações antigas continuam editáveis com campo vazio e modelo legado preservado. Nada foi ativado, inscrito ou enviado; validações locais usam apenas dados sintéticos. O pedido é revisar antes de publicar.

A proteção de nomes reconhece algumas construções explícitas, não toda identidade possível em linguagem natural; não é verificação de licença/identidade. Bloqueia padrões reconhecíveis de apresentação repetida quando há rascunhos recentes válidos, mas permite acompanhamento em primeira pessoa sem nova apresentação. Não promete detectar todas as paráfrases. Prévia com resposta simulada não prova qualidade ou aceitação de geração real por modelo.

## Agenda editável — correção local, sem publicação

- Repetição aceita **1 a 43.200 minutos** (30 dias), incluindo 10 minutos; espera inicial aceita **0 a 43.200 minutos**. UI, salvamento e prévia/API usam a mesma validação de agenda, rejeitando zero na repetição, negativos, não finitos, frações de minuto e valores acima do limite. Default continua 1.440 minutos; nenhuma configuração existente é regravada automaticamente.
- Número e unidade permanecem editáveis com rascunho vazio/inválido. **Trocar a unidade mantém o número digitado e muda a duração**: 2 dias → selecionar horas significa 2 horas, não 48 horas. Resumo explícito acompanha a edição. Na reabertura usa a maior unidade inteira exata (1.501 fica em minutos), sem exibir frações matemáticas geradas por conversão. Decimais exatos como 1,5 hora são aceitos sem arredondar minutos.
- Atalhos: 10 min, 30 min, 1 h, 1 dia; espera inicial também oferece Agora. Intervalos menores que uma hora têm aviso não bloqueante sobre excesso de mensagens/custo. Agora significa sem espera inicial **dentro da agenda**, não promessa de envio imediato; polling, janela e processamento podem adiar o envio.
- Horários usam hora 1–12, minuto 00–59 editável e AM/PM, preservando 09:17 e 18:23. 12 AM é meia-noite e 12 PM é meio-dia. Início deve ser anterior ao fim no mesmo dia; rascunho incompleto bloqueia salvar/gerar, nunca os controles de correção.
- Sem migration: a 052 persiste `ai_config` como JSONB e valida apenas objeto presente no SQL, sem mínimo de repetição de 60 minutos. Busca em migrations não encontrou outro limite. Engines continuam calculando os minutos configurados sem clamp; propriedade, inbound stop, modelos, apresentação e regras de transporte não foram modificados.
- Harness `tests/ai-sequence-browser.mjs` monta a página React real com CSS/fontes locais e fixtures de APIs. Bloqueia outras origens, exercita apagar→mudar unidade→corrigir, limites, atalhos, horários precisos, salvar/reabrir e legado, além de desktop, 390/320 px e tema escuro. Evidências são criadas em diretórios únicos; chamadas de prévia são simuladas, sem provedor/envio/ativação/inscrição.

## Instruções da IA — implementação local, sem publicação

`ai_config.instructions` é um guia opcional por sequência, até 6000 caracteres, com trim; ausente vira vazio. Tipos inválidos e excesso são rejeitados antes de salvar/prévia. O Brief de 300 caracteres continua como contexto comercial e a apresentação de 300 como referência de identidade/abertura. Nenhuma migration: a RPC 052 persiste o JSONB completo.

Na aba Mensagem há textarea amplo, contador e sugestões de propósito, modo de atuação, abordagem e tom. Salvar/reabrir preserva o guia; editar invalida prévias prontas e em andamento. Isto orienta cada geração, não treina permanentemente o modelo.

O guia segue em JSON no papel user, nunca interpolado no system. O system autoriza sua influência sobre estilo e abordagem, subordinada ao schema, idioma do lead, objetivo e limites/segurança do app. Identidade continua exclusiva da apresentação. Parágrafos, listas numeradas e orientações negativas sobre preços/saúde são permitidos. Contatos reconhecíveis e atribuições explícitas de dados pessoais são retidos antes do provedor, sem ecoar o texto em erros/logs; isto não é anonimização nem detecção universal de PII. Os filtros de saída existentes permanecem intactos. Testes de payload e respostas simuladas não provam obediência semântica universal de um modelo real.

## Engagement-first — implementação local

O primeiro passo agora é obter uma resposta com **uma pergunta curta e natural**, não pedir ligação/reunião em toda mensagem. `goal` continua `call`/`meeting` como objetivo final, sem migration ou regravação de configurações. A primeira resposta continua encerrando a sequência para atendimento humano; não há chatbot ou alteração de cron, cadência, tentativas e modelo.

Instruções orientam voz e pergunta, inclusive perguntas gerais voluntárias sobre idade, estado civil ou tempo nos EUA, uma por mensagem. Não são enviados fatos pessoais do lead nem permitidas perguntas sobre saúde, renda, SSN ou contatos. Brief/PII/identidade/preços/garantias mantêm as proteções; palavras de agenda, inclusive hoje/today/hoy, continuam conservadoramente bloqueadas e o prompt recomenda evitá-las.

O padrão rejeita menções lexicais a ligação/reunião. Convite direto requer uma frase afirmativa separada nas instruções: `Convide diretamente para uma ligação.` / `Convide diretamente para uma reunião.`; equivalentes aceitos: `Invita directamente a una llamada/reunión.` e `Invite directly to a call/meeting.` (substitua a alternativa pelo objetivo). É um opt-in lexical deliberadamente limitado: paráfrases não reconhecidas permanecem engagement-first; não é interpretação universal de intenção. O convite continua opcional e deve corresponder ao objetivo final. O payload informa `final_goal_word`, não `required_goal_word`.

Perguntas de engajamento não recebem link de agenda. Apenas com opt-in explícito, objetivo reunião e termo de reunião na pergunta final o link validado é anexado localmente; nunca é entregue ao modelo. Os limites de tamanho e proteção de URLs permanecem. Histórico `draft:v1:` aceita e deduplica também perguntas de engajamento; o histórico bruto continua excluído. Detecção de idioma é lexical, com vocabulário adicional estreito para perguntas curtas PT/ES/EN, não detector universal.

## Conversa curta e variada

Prévia sintética administrativa: `POST /api/sequences/preview` aceita `sample_count` inteiro de 1 a 6. Omitido ou 1 preserva `{body, choice, sent:false}`; mais de 1 exige administrador e retorna `{samples:[{body,choice}], sent:false}`. A série é gerada sequencialmente, usando apenas as últimas três escolhas produzidas na própria requisição; histórico/dados de cliente enviados pelo chamador são ignorados. Não consulta leads, grava dados de negócio nem envia mensagens. Uma falha não retorna amostras parciais; a rota dispõe de até 180 segundos. Fixtures não certificam a qualidade real da redação.

Corpo novo: teto de 180 caracteres, sugestão de 100–160 e um emoji leve por padrão, antes da pergunta final. Instrução explícita sem emoji e preferências compatíveis de assunto prevalecem; ausência de emoji não reprova texto seguro. O propósito comercial é objetivo final, não obrigação de repetir life insurance, “Quero ajudar/simplificar/esclarecer” ou “sem pressão”.

Mecanismo leve: o prompt pede comparar internamente assuntos e intenções das últimas três drafts revalidadas e escolher assunto ausente, não uma pergunta sinônima. Cada pergunta deve buscar uma informação útil ao agente humano sobre família/dependentes/responsabilidades, apoio aqui ou no Brasil, existência de reserva (sim/não, nunca saldo), proteção existente ou prioridades de segurança. Antes de redigir, escolhe privadamente a informação e responsabilidade pertinentes. Compra de casa, sonhos, hobbies e adaptação genérica não são assuntos isolados; casa/vida nos EUA exigem ligação explícita com responsabilidades ou proteção familiar na própria pergunta, inclusive sob instruções de assunto. Pergunta direta, sem preâmbulos repetidos como “Gostaria de conhecer”, “Tenho curiosidade” ou “Gosto de entender”, sem forçar produto ou convite. Calibração somente no system prompt: nenhum novo campo JSON ou filtro semântico capaz de pausar a sequência. Não usa índice pelo tamanho do histórico, nova tabela nem campo JSON de resposta. Histórico antigo seguro até 300 caracteres permanece elegível; filtra antes de selecionar as últimas três. São tentativas outbound, nunca respostas ou evidência de conversa anterior. Modelos, configuração salva, parada ao responder, opt-in de convite e link local seguem intactos.

Novas perguntas continuam voluntárias e gerais: não coletar valores, renda, saúde, SSN, contatos, documentos ou status migratório. O filtro lexical acrescenta padrões de saldo/valores/documentos/imigração, sem afrouxar os filtros existentes. É defesa em profundidade, não detector semântico universal. Fixtures PT/ES/EN exercitam seis temas consecutivos e o contexto móvel; comprovam contrato/orientação e aceitação local, **não** diversidade real de um provedor. O teste `ai-sequence-protection-focus.test.ts` captura o payload real de `generateSequenceCopy` em PT/ES/EN para verificar foco, contexto outbound e contrato JSON; as respostas são fixtures, não prova de obediência semântica. Prévia sintética real após publicação pertence à validação de release.

## Contrato

- `sequences.mode`: `legacy` (padrão) ou `ai_until_reply`, imutável após criação. Inscrições também guardam o modo; não há conversão ou inscrição retroativa.
- Toda sequência IA nasce **desativada**, mesmo se o cliente mandar `enabled: true`. Ativação posterior não inscreve leads existentes.
- Objetivo `call` ou `meeting`; espera inicial e intervalo em minutos; janela diurna com timezone IANA, dias 0=domingo..6=sábado, início inclusivo/fim exclusivo. Janelas que atravessam meia-noite não são aceitas nesta fase. Não são horários de recebimento de leads.
- Inscrição manual pelo painel (busca de nomes, até 50 resultados) ou entrada futura no estágio gatilho. Até 200 inscrições recentes por sequência são exibidas. Leads delegados a membros são retidos nesta primeira fase; é necessário dono direto e bridge própria.
- **Não é chatbot**: qualquer inbound WhatsApp gravado e associado a comprador+lead (incluindo mídia sem texto) encerra. SMS inbound associado ao lead também encerra. Outbound e recibos de leitura não encerram.
- Resposta comum anterior à inscrição não impede recuperação; somente eventos posteriores à inscrição encerram. Opt-out anterior continua bloqueando mesmo sem inscrição existente.
- Resposta, opt-out, parada manual e entrega ambígua deixam bloqueio persistente de reentrada IA. Não há retomada automática nem botão de reset. Excluir/recriar sequência não limpa esse bloqueio. Opt-out continua impedido mesmo após transferência.
- Transferência, delegação, arquivo, venda, suspensão do comprador, desativação da sequência e saída configurada de estágio encerram pelas mutações do banco e são rechecados antes do envio. Venda por estágio usa a regra existente `isWonStage`, com teste de paridade SQL.
- Legado conserva sua execução finita e reentrada por estágio; não foi convertido para o mecanismo IA.

## Geração e privacidade

`src/lib/ai-sequence-copy.ts` usa `fetch`, o modelo OpenAI escolhido em `ai_config.model`, JSON e timeout de 20 segundos. A IA **redige mensagens novas**, orientadas pelo brief comercial e objetivo ligação/reunião, em PT/ES/EN; não escolhe índices de frases. JSON exige `locale` e `body`. O corpo gerado tem até 180 caracteres e a mensagem completa até 450, incluindo o link opcional anexado localmente, sem prefixo obrigatório de assistente virtual. Exige uma pergunta final de engajamento por padrão; convite ao objetivo final somente mediante orientação explícita reconhecida. Erros, JSON inválido, truncamento e repetição retêm a geração, sem mensagem substituta.

O brief comercial explícito (até 300 caracteres) é enviado como dado não confiável, separado das instruções de sistema. Não inclua nomes nem dados pessoais/sensíveis: padrões reconhecíveis de contatos, renda, saúde, identificação pessoal e injeção são rejeitados antes da requisição. Nenhum campo do lead é enviado, exceto o idioma resolvido por `requireLeadMessageLocale`; não são enviados conversa crua nem URL de agendamento. O idioma do preview é ilustrativo. `recent_choices` guarda os últimos textos gerados (podendo incluir o nome profissional fornecido na apresentação), marcados `draft:v1:`, revalidados antes de irem ao modelo; repetição normalizada (caixa, acentos, pontuação/espaços) é rejeitada. Índices antigos são ignorados.

Validação local rejeita URLs/contatos/números, múltiplas perguntas, tamanho excedido e padrões óbvios de preços, promessas, disponibilidade, datas e identidade inventada; idioma/CTA têm checagem lexical. Esses filtros e instruções são defesa em profundidade, **não garantia semântica absoluta** nem anonimização geral: podem reter texto legítimo e não detectar toda paráfrase, nome ou mistura de idiomas. Não há personalização por dados do lead. A revisão humana do brief/exemplo continua necessária.

Link é anexado localmente somente para convite explícito reconhecido de reunião, nunca em pergunta de engajamento, e quando informado explicitamente: HTTPS, domínio público sintaticamente válido, sem credenciais/IP/porta/whitespace/markup. A aplicação não busca o link nem confirma agenda/disponibilidade.

## Modelos, compatibilidade e custo

Catálogo público oficial consultado em **29/09/2026**: [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). A allowlist compartilhada fica em `src/lib/ai-sequence-models.ts`, com IDs, rótulos e descrições para o formulário. A presença no catálogo público **não comprova acesso da conta**: acesso real e qualidade/latência não foram testados nesta mudança local.

- **Novas sequências:** `defaultAIConfig.model = gpt-6.1-sol`.
- **Configuração antiga sem `model`:** validação resolve explicitamente para `gpt-4o-mini`, preservando envios existentes; editar/carregar não deve substituir esse legado pelo default novo.
- Escolhas permitidas: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-luna` e `gpt-4o-mini` (legado). IDs arbitrários, vazios ou `null` são rejeitados. O modelo validado é preservado no salvamento e usado sem substituição pelo gerador comum à prévia e ao engine.
- Usa a mesma `OPENAI_API_KEY` já prevista na integração; não há nova credencial, outro provedor, fallback silencioso de modelo nem consulta à lista privada da conta.
- **Sem nova migration para o seletor:** `ai_config` já é JSONB; a RPC `save_sequence` da migration 052 persiste o objeto inteiro. Não houve alteração/aplicação de SQL nesta mudança.

Contrato do [guia GPT-6](https://developers.openai.com/api/docs/guides/latest-model) e da [referência Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create): Sol 6.1 e Astra usam `reasoning_effort: low` e `max_completion_tokens: 2048` (inclui raciocínio e saída), **sem `temperature`/`max_tokens`**; Luna usa `reasoning_effort: none` e limite 400, também sem temperatura. A página específica de Sol **6.1** prevalece sobre referências ao Sol 6 no guia: Sol 6.1 não aceita `none`. O legado conserva temperatura 0.7 e limite 240. Não há ferramentas nem function calling.

Mantém `response_format: {type: 'json_object'}` e a exigência explícita de JSON no prompt, com validação local estrita de `locale` e `body`. JSON mode não garante schema nem segurança semântica; não é apresentado como Structured Outputs. `store: false` é explícito, sem prometer retenção zero pelo provedor.

Cada geração faz **no máximo uma requisição**: não foi implementada segunda tentativa automática de formatação. Isso limita custo/latência e impede que falhas de segurança disparem gerações extras. O usuário pode pedir outra prévia conscientemente; as tentativas programadas existentes do engine continuam inalteradas. Sol/Astra podem gastar tokens de raciocínio dentro do limite e sofrer truncamento/timeout; não há garantia de que o orçamento seja suficiente para toda entrada. Astra tem custo maior conforme o catálogo público.

## Diagnóstico da prévia

A antiga captura de exceções devolvia um 503 genérico para causas distintas, sem diagnóstico. O 503 observado em produção **não permite determinar sua causa específica**. Fixtures locais reproduziram separadamente chave ausente, HTTP de provedor, rede/timeout, JSON inválido, texto rejeitado e repetição. Não houve chamada real ao provedor ou envio a leads para esta verificação.

A prévia retorna `error` legível, `code` estável e `sent: false`. Códigos e status:

| Código | HTTP | Ação indicada |
| --- | --- | --- |
| `AI_CONFIG_INVALID`, `AI_LOCALE_INVALID`, `AI_BRIEF_INVALID` | 400 | Corrigir configuração/idioma/brief, sem dados pessoais |
| `AI_KEY_MISSING` | 503 | Administrador revisar configuração da chave |
| `AI_PROVIDER_AUTH`, `AI_PROVIDER_FORBIDDEN` | 503 | Administrador revisar chave/permissões (não é expiração da sessão do usuário) |
| `AI_MODEL_UNAVAILABLE` | 503 | Verificar acesso ao modelo ou escolher outro explicitamente |
| `AI_QUOTA_EXCEEDED` | 503 | Administrador revisar créditos/cota |
| `AI_RATE_LIMITED` | 429 | Aguardar antes de repetir |
| `AI_TIMEOUT` | 504 | Repetir conscientemente ou selecionar outro modelo |
| `AI_NETWORK_ERROR`, `AI_PROVIDER_UNAVAILABLE` | 503 | Tentar mais tarde |
| `AI_PROVIDER_REQUEST` | 502 | Suporte revisar parâmetros da integração |
| `AI_BAD_JSON`, `AI_INVALID_TEXT`, `AI_REPEATED_TEXT` | 502 | Revisar brief comercial/gerar outra prévia |
| `AI_INTERNAL_ERROR` | 503 | Erro não classificado: suporte investigar |

O log `[ai-sequence-preview]` contém apenas código, status HTTP local, modelo validado quando disponível, status do provedor e request ID sintaticamente seguro (`req_` com tamanho limitado). Não registra chave, brief, dados do lead, resposta gerada, exceção/stack bruta nem corpo de erro do provedor. Headers fora do padrão são omitidos. Falhas de sessão/propriedade continuam 401/403 antes de gerar.

Dois falsos positivos foram comprovados por testes antes de corrigir: `\b` não reconhecia o fim acentuado de **você**, rejeitando “Você quer uma ligação?”; o mês inglês **May** também bloqueava “May we arrange a call with your agent?”. A correção usa fronteira Unicode apenas na evidência lexical PT e uma exceção estreita para pergunta de permissão inglesa no início. Referências a datas (`in May`), contatos, PII, promessas e disponibilidade continuam bloqueadas. Esses casos **não foram identificados como causa do incidente de produção**.

## Correção de execução e cadência — implementação local, não publicada

- `brief` normaliza espaços, tabulações e quebras de linha na validação compartilhada de salvar, prévia e engine. O caso exato `"\n"` vira vazio também ao ler configurações antigas, sem regravá-las. O limite original de 300 caracteres é verificado antes da normalização; filtros de conteúdo inseguro permanecem.
- Falhas de geração persistem somente código e motivo de rejeição allowlisted no `stop_reason` existente. Nenhuma exceção, texto do provedor, credencial ou dado de lead entra nesse campo. O painel traduz os códigos, inclusive o antigo `generation_unavailable` (causa detalhada desconhecida), e mostra tentativas, último envio confirmado e próxima tentativa — não promessa de envio.
- Falhas pré-transporte passam a adiar por cinco minutos, mantendo teto SQL de três tentativas e pausa depois. Entrega ambígua continua pausada e sem reenvio automático. Não há migration, reativação, reprogramação de vencimentos antigos, inscrição retroativa ou limpeza de supressões.
- Cron dedicado `/api/cron/ai-sequences`: `* * * * *`, somente IA, autenticado exclusivamente por `Authorization: Bearer CRON_SECRET`; ausência/erro do segredo retorna 401, user-agent não autentica. `maxDuration=300` permite processamento, sem garantia de terminar um lote inteiro.
- `run-all` também deixa de autenticar por user-agent (mantém os mecanismos existentes por segredo) e continua a cada cinco minutos com sequências **legacy**, automações e lembretes; captura Meta continua a cada dois minutos. Filtro de modo/active/due ocorre no banco **antes** do limite, ordenado pelo vencimento. Chamadas diretas sem filtro e inline mantêm compatibilidade; claims/leases SQL existentes protegem sobreposição e duplicidade IA.
- Cadência é polling em minutos, não temporizador exato. Fila, janela, duração de geração, limites e disponibilidade podem adiar a tentativa. A alteração local não comprova publicação, execução do scheduler nem acesso real ao provedor.

## Execução e falhas

- Cron e inline usam o mesmo claim SQL com row lock, `SKIP LOCKED`, token e lease de 2 minutos. Índice parcial permite somente uma inscrição IA ativa/pausada por comprador+lead, sem bloquear sequências legadas.
- Geração e entrega têm status distintos. Somente `finish_ai_send` avança o contador, após ID de envio confirmado, e persiste outbound na mesma transação. Há dedupe com o webhook outbound da mesma conta/lead.
- Bridge própria obrigatória, readiness e limitador existentes antes de gerar; nenhuma queda para bridge global. Falha pré-transporte retém o passo, aguarda cinco minutos e limita a três tentativas. Depois pausa.
- Depois da geração há nova checagem da janela e guarda SQL de propriedade/resposta/estado imediatamente antes do transporte.
- Timeout, erro de transporte, resposta sem ID ou falha para persistir confirmação pausam como `delivery_unknown`; não repetem cegamente. Lease expirada em `sending` também pausa e bloqueia reentrada.
- Próximo horário deriva do instante de envio confirmado, não do vencimento antigo: não descarrega atrasos acumulados.
- Não existe recall: resposta/transferência depois que o transporte começou pode coincidir com uma mensagem já em andamento. A guarda não constitui transação distribuída com WhatsApp.

## API e banco

Rotas `/api/sequences`, `/api/sequences/[id]`, `/api/sequences/enroll` e `/api/sequences/preview` derivam identidade de `callerBuyer`. Nem admin pode personificar outro comprador pelo body/query. Stage e template são validados no salvamento transacional; inscrição revalida dono de sequence+lead no SQL. Templates globais somente quando `is_system=true` e `buyer_id IS NULL`.

Migration: `supabase/migrations/052_ai_sequences_until_reply.sql`. Aditiva: novos campos, supressões, índice, RPCs e triggers; nenhum backfill ou ativação. Mutação direta das tabelas de sequências é revogada para anon/authenticated; RPCs internos são exclusivos de service_role e têm search_path fixado. O painel usa API autenticada. Configuração+steps são salvos atomicamente, com rollback integral se um template/stage não pertencer ao dono.

**Primeira versão publicada em 29/09/2026**, após autorização: migration 052 aplicada, PR #21 integrado em `11de1cf39a26ec2ae15d451b4ef3090d76808340` e deployment `dpl_A9jm1Mo5V5gpNx8GBU6K5UeJrVdp` confirmado naquele momento. O readback registrou 7 triggers, 30 sequências/582 inscrições antigas preservadas e nenhuma sequência/inscrição IA; são evidências históricas, não contagens atuais. O redesenho, seletor e diagnóstico foram posteriormente integrados à main; os registros de verificação abaixo são históricos. A apresentação personalizada desta revisão está somente local, sem publicação e sem alteração de SQL. A confirmação do deployment vigente não faz parte desta verificação local. Supressões não devem ser limpas durante rollback. Clientes externos que escreviam direto nas tabelas via authenticated precisam usar as rotas.

## Verificação local e limites

Testes em `tests/ai-sequence-*.test.ts`: configuração/fusos, geração/privacidade, API, handlers de salvamento, renderização SSR de controles, despacho legado/IA, adapter de transporte mockado e execução real de SQL via PGlite. Nenhuma requisição real ao OpenAI/bridge nem inscrição de cliente foi feita.

PGlite tem uma única sessão: `Promise.all` valida claim/rechecagem/idempotência no SQL, **não** disputa entre múltiplas conexões nem deadlocks. O ensaio separado `tests/ai-sequence-pg-concurrency.py` usa PostgreSQL 16 local, conexões independentes e fixture sintética: em 29/09/2026 passaram 31 cenários, incluindo interleavings internos de inbound/finish, parada manual/opt-out, lease expirado, adiamento e cascata de exclusão. Isso não prova todas as agendas possíveis nem o schema integral de produção. Não houve E2E visual num navegador autenticado; UI foi renderizada e os handlers de IO foram exercitados com fixtures. A associação de inbound ao cadastro continua pertencendo aos webhooks existentes; a feature não tenta adivinhar telefone/dono por conta própria.

Evidências locais (não versionadas): `/home/hermes/.hermes/profiles/lead4pro/cache/scratch/ai-sequences/`.
- `baseline.log`: npm test antes da implementação, exit 1, apenas falha preexistente `lead distribution triggers automations immediately after pipeline placement`.
- `red-*.log` / `green-*.log`: fatias de configuração, SQL/save/claim/finalização, geração, engine, API, UI, stops, dedupe, URL e anti-repetição.
- `parent-final-suite-second.log`: npm test, 279 testes / 278 passam / uma falha preexistente, exit 1. Baseline atual `0b780c2`: 242 testes / 241 passam / mesma falha.
- Lint e typecheck em `../ai-final-recovery/20260929T161039.494796Z/`: ESLint de 21 arquivos TS/TSX exit 0; typecheck da feature/base exit 2 com os mesmos 17 diagnósticos e nenhum adicionado. Alterações posteriores foram SQL, documentação e harness Python.
- `parent-build-recovery-20260929T1627.log`: build offline autorizado, exit 0, compilação e 129/129 páginas. O timeout anterior do snapshot permanece preservado em `../ai-final-recovery/20260929T161039.494796Z/feature-build-offline.log`; sua causa não foi determinada. Build não valida tipos, pois `ignoreBuildErrors` está ativo.
- `../ai-pg-multiconn/parent-final31.log`: PostgreSQL real 31/31, cluster encerrado. Migration examinada SHA-256 `815159acf58ceef904741980712bfeb70763a94063ae209f43b319f98566c663`. REDs anteriores permanecem em `parent-second-red.log` e `parent-second-allpaths-red.log`. Locks de enrollment precedem supressões em todos os writers; exclusão em cascata do próprio lead/comprador não tenta recriar supressão órfã.

Comandos de teste (ambiente limpo):

```sh
env -i PATH="$PATH" HOME="$HOME" npm test
env -i PATH="$PATH" HOME="$HOME" node_modules/.bin/tsx --test tests/ai-sequence-*.test.ts
env -i PATH="$PATH" HOME="$HOME" node_modules/.bin/tsc --noEmit --incremental false
```

O teste PostgreSQL requer Python com `psycopg`, `TMPDIR` privado e `L4P_TEST_PG_ROOT` apontando a uma árvore local de binários com `usr/lib/postgresql/16/bin` e `usr/share/postgresql/16`. Execute `python tests/ai-sequence-pg-concurrency.py --label review` em ambiente limpo com essas variáveis. Ele cria somente cluster sintético, sem TCP ou credenciais externas, e encerra em `finally`; não conecta a banco existente. Snapshots ficam no scratch, nunca no Git.

### Verificação local do seletor e diagnóstico (29/09/2026)

- Ciclos RED→GREEN executados para default/allowlist, parâmetros reais de cada família, dois falsos positivos e diagnóstico de chave, HTTP, timeout/rede, JSON/texto/repetição e input.
- Suíte `ai-sequence-*.test.ts`: **51/51** no snapshot verificado; inclui SQL local, opt-out/supressão e guarda antes do envio, sem alteração desses mecanismos.
- `npm test`: **294 testes, 293 passam, 1 falha** (`lead distribution triggers automations immediately after pipeline placement`). A mesma falha foi reproduzida em snapshot separado de `11de1cf`.
- ESLint dos oito arquivos TS do backend/testes alterados: exit 0. Typecheck: **17 diagnósticos na alteração e os mesmos 17 na base**, nenhum novo após normalizar linhas/colunas.
- Evidências em `$TMPDIR/ai-experience-backend-{npm-test,base-test,tsc,base-tsc}.log`; base isolada em `$TMPDIR/ai-experience-backend-base-hNPDRV`, sem `.env*`.
- Gate integrado independente posterior, em `ai-gate-adg1hte3/`, comparou snapshots atuais da alteração e da base `11de1cf`: **294/295** versus **278/279**, com a mesma falha de asserção textual `finishLeadAssignment` (não mock timers nesta rodada). Ambos os builds exit 0 e 129/129 páginas; typegen exit 0 e os mesmos 17 diagnósticos TypeScript. `comparison-normalized.json` registra zero diagnóstico novo e nenhuma divergência de código no manifesto de 717 arquivos (`f0affebfe6e091d1c7d3d96f6503394fba100b185edad835431fab614ec36874`).
- Verificação conjunta da feature: pai e primeiro revisor executaram **53/53** testes; revisão visual local passou em desktop/mobile/escuro, com fixtures explícitas, preservação do modelo legado, modelo escolhido após salvar/reabrir, horários fora da grade, unidades exatas, cancelamento e prévias atrasadas. Novos horários são oferecidos em grade de 30 minutos; horários antigos fora dessa grade são preservados.
- Primeira tentativa de gate em `ai-independent-gate-1hhr_pfp/` foi interrompida e não é aprovação. Gate final usou snapshots sem `.env`, ambiente limpo e bloqueador no runtime Node (5 probes externos bloqueados), não isolamento de rede pelo SO. Acesso real aos modelos e correção do incidente em produção continuam **não verificados**.

### Verificação da apresentação personalizada (local, 29/09/2026)

- Pai executou a suíte da funcionalidade antes das últimas adições: 61/61. Depois adicionou teste de API/salvamento e SQL real para o novo campo, além de reproduzir e corrigir a rejeição indevida de “I'm following up...” como apresentação repetida (RED 4/5, GREEN no recorte 5/5).
- Gate final amplo: **305/306** na alteração versus **296/297** na base `e816a83`; mesma falha preexistente `lead distribution triggers automations immediately after pipeline placement`. Builds exit 0, lint/diff exit 0, TypeScript exit 2 com os mesmos 17 diagnósticos após normalizar caminhos/linhas, zero novos.
- Primeira tentativa de `npm test` do gate falhou antes dos testes por caminho IPC longo (`listen EINVAL`); evidência preservada. Reexecução com TMPDIR curto do perfil produziu as contagens acima; não se contou a tentativa interrompida como aprovação.
- Evidências: `cache/scratch/presentation-gate-iely3tj3/{results.json,retry-results.json,*-test-short-tmp.log}` no perfil Lead4Pro. `results.json` preserva a primeira tentativa e normalização inicial incompleta de caminhos; `retry-results.json` contém a comparação corrigida.
- Browser React real sobre fixtures locais: `PASS`, `externalRequests: 0`, salvamento/reabertura da apresentação, campo antigo vazio, erros preservam rascunho, edição cancela prévia antiga, desktop/mobile/escuro; imagens em `cache/scratch/presentation-browser-6Gjkia/ai-sequence-ui-evidence/`. Imagens examinadas pelo pai; não são produção nem geração real do provedor.
- Primeira revisão independente reprovou negação explícita de IA, afirmação de pessoa real e credencial médica aceitas. Correção mínima com 24 regressões PT/ES/EN: RED 24 falhas, GREEN 54/54 focados reexecutados pelo pai. Gate posterior: **329/330**, mesma falha legada; build/lint exit 0, os mesmos 17 diagnósticos TypeScript. Evidência final `presentation-gate-iely3tj3/final-results.json`; RED e diff isolado em `presentation-review-fix-ohz5ojyn/`.
- Segunda revisão independente `deleg_4ee2ad11`: **APROVADO**, 54/54 focados e três probes adicionais de acompanhamento PT/ES/EN; nenhuma preocupação de segurança/erro de lógica novo no escopo. Publicação e geração real com o novo campo continuam pendentes por decisão de revisar antes de subir. Não houve nova migration, escrita no banco real, ativação ou envio.

## Lições reutilizáveis

- Em trigger genérica PL/pgSQL, faça IF separado por tabela **antes** de acessar `NEW.campo` específico; o planejador resolve campos mesmo quando outra condição AND é falsa.
- Não finalize envio com INSERT incondicional: webhook outbound pode ter gravado o mesmo ID primeiro. Aceite dedupe apenas se dono, lead, direção, corpo e horário da tentativa coincidirem. ID desconhecido ainda depende da confirmação do bridge, não é prova independente de entrega no aparelho.
- Preserve a ordem cronológica ao aparar textos gerados recentes, ou a próxima geração esquece a mensagem mais recente.
- Carregue a implementação IA apenas no ramo opcional: preserva dependências e testes de idioma dos fluxos legados.
