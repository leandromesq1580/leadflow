# Sequências IA WhatsApp até resposta — implementação local

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

`src/lib/ai-sequence-copy.ts` usa `fetch`, OpenAI `gpt-4o-mini`, JSON e timeout. A IA **redige mensagens novas**, orientadas pelo brief comercial e objetivo ligação/reunião, em PT/ES/EN; não escolhe índices de frases. JSON exige `locale` e `body`. O corpo gerado tem até 300 caracteres e a mensagem completa até 450, incluindo identificação de assistente virtual IA inserida localmente em **todas** as mensagens e link opcional. Exige uma pergunta final referente ao objetivo. Erros, JSON inválido, truncamento e repetição retêm a geração, sem mensagem substituta.

O brief comercial explícito (até 300 caracteres) é enviado como dado não confiável, separado das instruções de sistema. Não inclua nomes nem dados pessoais/sensíveis: padrões reconhecíveis de contatos, renda, saúde, identificação pessoal e injeção são rejeitados antes da requisição. Nenhum campo do lead é enviado, exceto o idioma resolvido por `requireLeadMessageLocale`; não são enviados conversa crua nem URL de agendamento. O idioma do preview é ilustrativo. `recent_choices` guarda os últimos textos gerados sem personalização, marcados `draft:v1:`, revalidados antes de irem ao modelo; repetição normalizada (caixa, acentos, pontuação/espaços) é rejeitada. Índices antigos são ignorados.

Validação local rejeita URLs/contatos/números, múltiplas perguntas, tamanho excedido e padrões óbvios de preços, promessas, disponibilidade, datas e identidade inventada; idioma/CTA têm checagem lexical. Esses filtros e instruções são defesa em profundidade, **não garantia semântica absoluta** nem anonimização geral: podem reter texto legítimo e não detectar toda paráfrase, nome ou mistura de idiomas. Não há personalização por dados do lead. A revisão humana do brief/exemplo continua necessária.

Link é anexado localmente somente para objetivo reunião e quando informado explicitamente: HTTPS, domínio público sintaticamente válido, sem credenciais/IP/porta/whitespace/markup. A aplicação não busca o link nem confirma agenda/disponibilidade.

## Execução e falhas

- Cron e inline usam o mesmo claim SQL com row lock, `SKIP LOCKED`, token e lease de 2 minutos. Índice parcial permite somente uma inscrição IA ativa/pausada por comprador+lead, sem bloquear sequências legadas.
- Geração e entrega têm status distintos. Somente `finish_ai_send` avança o contador, após ID de envio confirmado, e persiste outbound na mesma transação. Há dedupe com o webhook outbound da mesma conta/lead.
- Bridge própria obrigatória, readiness e limitador existentes antes de gerar; nenhuma queda para bridge global. Falha pré-transporte retém o passo, aguarda uma hora e limita a três tentativas. Depois pausa.
- Depois da geração há nova checagem da janela e guarda SQL de propriedade/resposta/estado imediatamente antes do transporte.
- Timeout, erro de transporte, resposta sem ID ou falha para persistir confirmação pausam como `delivery_unknown`; não repetem cegamente. Lease expirada em `sending` também pausa e bloqueia reentrada.
- Próximo horário deriva do instante de envio confirmado, não do vencimento antigo: não descarrega atrasos acumulados.
- Não existe recall: resposta/transferência depois que o transporte começou pode coincidir com uma mensagem já em andamento. A guarda não constitui transação distribuída com WhatsApp.

## API e banco

Rotas `/api/sequences`, `/api/sequences/[id]`, `/api/sequences/enroll` e `/api/sequences/preview` derivam identidade de `callerBuyer`. Nem admin pode personificar outro comprador pelo body/query. Stage e template são validados no salvamento transacional; inscrição revalida dono de sequence+lead no SQL. Templates globais somente quando `is_system=true` e `buyer_id IS NULL`.

Migration: `supabase/migrations/052_ai_sequences_until_reply.sql`. Aditiva: novos campos, supressões, índice, RPCs e triggers; nenhum backfill ou ativação. Mutação direta das tabelas de sequências é revogada para anon/authenticated; RPCs internos são exclusivos de service_role e têm search_path fixado. O painel usa API autenticada. Configuração+steps são salvos atomicamente, com rollback integral se um template/stage não pertencer ao dono.

**Não aplicada em produção.** Deploy e migration dependem de autorização separada. As rotas novas exigem o schema novo; coordenar aplicação da migration antes da publicação. Supressões não devem ser limpas durante rollback. Clientes externos que escreviam direto nas tabelas via authenticated precisam usar as rotas.

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

## Lições reutilizáveis

- Em trigger genérica PL/pgSQL, faça IF separado por tabela **antes** de acessar `NEW.campo` específico; o planejador resolve campos mesmo quando outra condição AND é falsa.
- Não finalize envio com INSERT incondicional: webhook outbound pode ter gravado o mesmo ID primeiro. Aceite dedupe apenas se dono, lead, direção, corpo e horário da tentativa coincidirem. ID desconhecido ainda depende da confirmação do bridge, não é prova independente de entrega no aparelho.
- Preserve a ordem cronológica ao aparar textos gerados recentes, ou a próxima geração esquece a mensagem mais recente.
- Carregue a implementação IA apenas no ramo opcional: preserva dependências e testes de idioma dos fluxos legados.
