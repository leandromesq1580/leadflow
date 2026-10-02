# Ao responder, mover para…

Status: implementado e verificado **localmente**, sem publicação ou alteração de configuração existente.

## Contrato

- Opção da sequência tradicional e IA; padrão desligado. `sequences.reply_stage_id uuid NULL` segue a convenção de `trigger_stage_id`, com FK para `pipeline_stages` e `ON DELETE SET NULL`. Migration aditiva `056_sequence_reply_stage.sql`; 052–055 não são editadas. Sem backfill, inscrição, ativação ou movimento de cartões na instalação.
- PATCH sem a chave preserva o destino; `null` desliga. UI de edição e duplicação enviam o destino explicitamente. Cópias permanecem desativadas e sem inscrições.
- `save_sequence` valida na mesma transação a configuração efetiva (campos antigos + PATCH), dono do gatilho/destino e pipeline. Destino inválido/não autorizado retorna 403, UUID malformado ou incompatibilidade de pipelines retorna 400. A validação acontece antes da atualização/alteração de passos.
- Com gatilho, destino deve estar no mesmo pipeline. O cartão deve continuar na coluna gatilho e `moved_at` não pode ser posterior à inscrição, inclusive se saiu e voltou manualmente. A proteção temporal `moved_at <= enrolled_at` vale também sem gatilho. Sem gatilho, só é atualizado o cartão já existente no pipeline do destino: não cria cartão, não transfere entre pipelines.
- A UI compartilhada desktop/mobile oferece toggle, seletor condicional com placeholder obrigatório e mensagens PT/EN/ES. Destino ausente/incompatível bloqueia salvar enquanto ligado; trocar o gatilho limpa seleção incompatível. Desligar envia `null`; erros preservam o rascunho. Não há badge/indicador novo no pipeline.

## Inbound e segurança

A função SQL existente `stop_ai_sequence_on_inbound` continua atendendo WhatsApp e SMS. WhatsApp usa comprador + lead da mensagem e confere dono atual; SMS usa o lead já resolvido pelo webhook e seu dono atual. Não procura outros leads por telefone na movimentação. O resolvedor de telefone do webhook SMS não foi modificado: as garantias aqui começam na associação inbound → lead existente, não prometem eliminar toda ambiguidade anterior de atribuição de SMS.

A resposta precisa ser posterior ou igual à inscrição, e a inscrição precisa estar ativa/pausada, sem entrega unknown ou bloqueio persistente incompatível. A sequência deve estar habilitada. Não há movimento retroativo de inscrições paradas. Opt-out/STOP (incluindo STOPALL/CANCEL/END/QUIT e as formas já aceitas PT/ES) interrompe, mas nunca move. Outbound não move. Resposta de mídia sem texto conserva a semântica inbound já existente; não há classificador de intenção comercial.

**Conflitos:** destinos distintos entre candidatas válidas fazem a função abster-se de todo movimento, mesmo entre pipelines. Destinos iguais convergem para uma única atualização; todas as candidatas com gatilho precisam continuar compatíveis com o cartão. A parada das inscrições permanece independente desse resultado. Duplicatas/replay não voltam a mover após a parada.

A intenção de movimento é gravada atomicamente junto à suppression e à parada, antes do bloco acessório. `sequence_reply_moves` mantém snapshot do cartão/origem/`moved_at`, inscrições/configuração/destino/donos, tentativas, SQLSTATE e resultado terminal (`moved` ou `cancelled` com motivo). RLS e ACL restringem tabela e RPCs ao serviço. Se a materialização da fila falhar, a intenção permanece na suppression e é recuperada pelo worker; não depende de outra resposta.

A ordem lead `NO KEY UPDATE` → inscrições ordenadas → suppressions é preservada. Locks acessórios continuam `NOWAIT`; contenção/erro transitório mantém a intenção pendente e agenda nova tentativa após um minuto, sem expiração automática. O cron autenticado existente `/api/cron/ai-sequences`, a cada minuto, chama `processSequences`, que drena ambos os modos mesmo sem envios vencidos (25 itens por chamada; RPC limitada a 100). Workers usam `SKIP LOCKED`/`NOWAIT`, revalidam todos os snapshots e nunca reativam inscrições nem enviam mensagens. Movimento manual, STOP/unknown, encerramento/arquivamento, troca de dono, configuração alterada/desativada/excluída ou destino inválido cancelam a intenção com motivo auditável. Renomear o destino não invalida sua identidade. Revisões monotônicas impedem mudanças de configuração/dono A→B→A de liberar uma intenção antiga.

Falha/timeout do movimento reverte somente o bloco acessório, preservando mensagem, suppression e parada. Timeout/erro do RPC no cron é isolado do processamento de envios; rollback de uma transação de drenagem deixa a intenção persistida para outra execução. Não há prazo exato de movimentação: cron atrasado, backlog e contenção prolongada podem adiar a execução. Banco indisponível ou cancelamento da transação inbound antes de persistir a parada continuam exigindo retry do webhook; não são declarados sucesso. Logs não incluem corpo/identidade.

Não chama a API de pipeline, `autoEnrollByStage` nem execução de automações; portanto não rearma inscrições legacy `replied`. Para impedir também as automações de estágio consultadas por polling, `pipeline_leads.sequence_reply_moved_at` marca esse movimento e ambas as consultas `stage_entered`/`stage_stale` o excluem. Um movimento ordinário posterior limpa a marca via trigger (e atualiza `moved_at` se o writer não o fizer). A marca não é renderizada como indicador. Automações independentes de estágio não foram alteradas.

As funções de batch/ledger/cota da 055 não são redefinidas. Preservados 10 envios por lote/remetente compartilhado, espera de cinco minutos após confirmação, leases, supressões e retenção de unknown.

## Verificação reproduzível, somente local

Usar ambiente limpo, sem `.env*`, credenciais ou transporte externo; dependências via `npm ci --ignore-scripts`.

- `node_modules/.bin/tsx --test tests/sequence-reply-stage.test.ts tests/sequence-reply-automation.test.ts tests/sequence-duplicate.test.ts`: contrato API, HTTP 400/403, omit/null, cópia e consultas reais de automação com IO sintético.
- `node --test tests/sequence-reply-stage-sql.test.cjs tests/sequence-batch-sql.test.cjs`: migrations reais em PGlite, fixtures sem produção; rollback, STOP/unknown, dono, mesmo telefone entre donos, WA/SMS, replay, destino removido, movimento manual, candidatos conflitantes. PGlite não comprova concorrência multissessão.
- `TMPDIR=<scratch-curto> REPLY_ARTIFACT_DIR=<evidências> L4P_TEST_PG_ROOT=<binários-PG16-extraídos> <venv>/bin/python tests/sequence-reply-pg.py`: cluster novo sem TCP, oito respostas concorrentes e contenção de cartão/destino/sequência nos dois modos; PostgreSQL encerrado no finally.
- `TMPDIR=<scratch-curto> L4P_TEST_PG_ROOT=<binários-PG16-extraídos> <venv>/bin/python tests/sequence-batch-pg-concurrency.py`: regressões batch/locks com a 056 aplicada após 055.
- `PLAYWRIGHT_MODULE=<playwright/index.mjs> TMPDIR=<evidências> node tests/sequence-reply-browser.mjs`: formulário React real, CSS real/fontes locais, APIs sintéticas e origens externas bloqueadas; desktop/390px, toggle, editar/duplicar, erro preservando rascunho, destino ausente/troca de gatilho, payloads e screenshots PT/EN/ES.

Suite, typecheck e lint são comparados com a base `ced8f9e6cd37b7d67d0a05cbd0c3486db1a8735a`. Build offline não equivale a typecheck aprovado nem a integração com Supabase/WhatsApp/Twilio reais. Evidências originais ficam no scratch `sequence-reply-stage-20261002/HANDOFF.md`; a revisão com retentativa durável e os gates atuais estão em `reply-stage-review-fixes-20261002/HANDOFF-RESUME.md`.

## Publicação pendente

Migration 056 e web exigem autorização separada. Aplicar a migration antes do novo web: as novas queries de automação dependem da coluna adicionada. O período anterior ao web novo é seguro enquanto nenhum destino for configurado; **não configurar a opção via API/SQL antigo nesse intervalo**, pois o polling antigo não conhece a marca silenciosa. Depois do web, a configuração continua desligada até escolha do usuário.

Rollback para web antigo com opções já configuradas também exige planejamento: desligar novos movimentos não limpa marcas de movimentos passados, e o polling antigo não respeita essas marcas. Não remover coluna/marca ou reverter web automaticamente. Nenhum deploy, migration de produção, commit, push ou merge é parte deste trabalho local.
