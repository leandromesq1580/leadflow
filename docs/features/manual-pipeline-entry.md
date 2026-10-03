# Inclusão silenciosa de lead existente no funil

## Comportamento

A ficha desktop (`/dashboard/leads/[id]`), o modal desktop de lead sem cartão e a ficha móvel existente (`/m/leads/[id]`, respeitando proxy/layout nativos) oferecem **Adicionar ao funil**. A opção aparece quando a consulta autenticada confirma que o lead não possui cartão. O usuário escolhe um funil e um estágio daquele funil; funis sem estágio não são selecionáveis.

É uma reparação, **não uma movimentação normal de estágio**:

- Não cria outro lead, não reatribui dono/membro, não altera créditos.
- Não exclui cartões nem move cartão preexistente.
- Não inicia sequências (legadas ou IA), follow-ups, mensagens nem automações de entrada/estagnação de estágio.
- Não pausa globalmente nem cancela explicitamente atividades preexistentes. Os triggers de segurança já existentes continuam ativos: podem encerrar inscrições incompatíveis com ownership/estágio. Trabalhos preexistentes e automações independentes da entrada no estágio não são desativados por esta ação.
- Cartão único já no mesmo funil **e estágio**: sucesso idempotente, sem nova auditoria e sem sobrescrever datas, posição ou estágio. Cartão em outro alvo, inclusive outro estágio do mesmo funil, ou múltiplos cartões legados: HTTP 409; nenhum cartão é alterado.
- Erros de consulta, HTTP e rede ficam visíveis. GET 401/403/404 é terminal: explica sessão, permissão ou lead indisponível sem oferecer retry. A leitura pela agência não concede reparação. Falhas transitórias permitem retentativa; a seleção é preservada após falha de inclusão, inclusive resposta inválida ou readback não confirmado. Duplo clique é bloqueado; sucesso somente após resposta validada e readback servidor do cartão exato.
- No modal, o callback recebe o cartão confirmado e atualiza funil/estágio imediatamente, recarrega os metadados e chama `onSaved` uma vez para invalidar o quadro (o consumidor atual também fecha o modal). Falha de refresh não desfaz sucesso nem oferece nova inclusão: conserva o cartão confirmado e informa que a visualização precisa ser reaberta. Não usa endpoints legados de movimentação. Preserve `key={leadId}` nos consumidores do componente.

A inclusão usa `sequence_reply_moved_at`, a marca de entrada silenciosa introduzida na migration 056. O polling atual de `stage_entered` e `stage_stale` já exclui essa marca. Seu significado foi documentado também como reparação manual; **não é necessário mudar o motor de automação para publicar esta feature**. Uma movimentação normal posterior para outro estágio limpa a marca pelo trigger já existente e retoma as regras normais dessa movimentação.

## Permissões e API

Fonte única: `src/lib/manual-pipeline-api.ts` + RPC `public.manual_lead_pipeline`.

- `GET /api/leads/:id/pipeline-entry`: opções válidas e elegibilidade; sem escrita de cartão.
- `POST /api/leads/:id/pipeline-entry`: sessão válida, lead próprio; membro ativo somente para lead atribuído a ele na conta proprietária. Admin nesta rota continua limitado aos próprios leads.
- `POST /api/admin/leads/:id/pipeline-entry`: sessão válida e `buyers.is_admin = true`, revalidado dentro da transação. Não usa segredo administrativo. Mesmo admin só pode adicionar ao funil do **dono atual do lead**.
- Corpo POST estrito: exatamente `pipeline_id` e `stage_id`, UUIDs canônicos minúsculos. Ator, dono e permissão administrativa nunca vêm do corpo.
- O acesso de leitura das fichas tocadas valida escopo antes de buscar PII e filtra a leitura final pelo dono e, quando aplicável, pelo membro. Agências mantêm a leitura autorizada por `podeOperarQuadro`. Reparação cliente é intencionalmente mais estrita: não inclui lead de outro comprador, mesmo se houver permissão de leitura/agência.

Exemplo **fictício**, só executar após autorização específica da operação e publicação:

```sh
l4p-admin POST /api/admin/leads/00000000-0000-4000-8000-000000000002/pipeline-entry \
  '{"pipeline_id":"00000000-0000-4000-8000-000000000003","stage_id":"00000000-0000-4000-8000-000000000004"}'
```

Não chamar a rota legada `move-leads-to-stage`, não tentar segredo default, não alterar wrappers, nem usar o POST legado de pipeline (ele faz upsert e pode iniciar automações).

## Atomicidade, auditoria e concorrência

A função tem `SECURITY DEFINER`, `search_path` fixo, execução revogada para PUBLIC/anon/authenticated e concedida somente a `service_role`; o servidor fornece a identidade obtida da sessão. As ACLs/RLS existentes não são relaxadas.

Para inclusão, um lock curto `SHARE ROW EXCLUSIVE NOWAIT` em `pipeline_leads` impede corrida com INSERT/UPDATE/DELETE legados que não usam locks por lead, inclusive o trigger destrutivo 039. Depois, a função bloqueia/revalida ator/membro, lead, pipeline e estágio. Os locks explícitos e o preflight das inscrições de IA usam NOWAIT. `SET lock_timeout='250ms'` na função limita **cada aquisição implícita** (relações, FKs, auditoria e triggers), retornando 55P03/HTTP 409 e revertendo cartão/auditoria/efeitos de triggers. A configuração anterior da sessão é restaurada na saída, inclusive em erro; não se depende de timeout do provedor nem de `statement_timeout` alterado dentro do comando já iniciado. Não é prazo total da RPC: execução sem espera e múltiplas aquisições podem somar mais tempo. **Trade-off:** uma escrita em outro lead pode causar conflito temporário. A operação é rara e pequena; não usar como endpoint de importação em lote. Operações posteriores ao commit continuam sujeitas às permissões e semântica legadas; esta reparação não reescreve o restante do CRM.

A criação e a auditoria em `pipeline_moves` (`action=add`, `via=manual-silent-entry`, IDs do ator e membro) são atômicas. Falha de auditoria desfaz a inclusão. A resposta só é confirmada após leitura do cartão exato. HTTP 503 após tentativa pode significar commit sem confirmação: repetir **o mesmo alvo**, não escolher outro estágio como tentativa de recuperação.

## Publicação e diagnóstico

1. Revisar/aprovar a nova migration **057_manual_pipeline_entry.sql**, depois da 056, e verificar que o número ainda está livre ao integrar.
2. Aplicá-la somente com autorização explícita. **Não foi aplicada em ambiente remoto durante a implementação.**
3. Publicar o código somente com autorização explícita. Não há variável de ambiente nova nem dependência de runtime nova.
4. Verificar sessão/role, ownership atual, estágio pertencente ao funil e ausência de cartões; executar somente a inclusão autorizada; conferir cartão, auditoria e ausência de novos trabalhos.

Sem RPC/migration, a UI apresenta erro (503); não há fallback para rotas inseguras. Sem sessão: 401; falta de permissão/owner/stage incompatível: 403; lead ausente/arquivado: 404; cartão/contenção: 409. Não diagnosticar procurando credenciais.

## Testes locais

- `npm test`: inclui SQL PGlite com migrations/triggers reais, sessão/API/readback e wiring/autorização das fichas.
- `node --import tsx --test tests/manual-pipeline-*.test.ts tests/lead-detail-access.test.ts`: conjunto focal.
- `TMPDIR=<scratch> PLAYWRIGHT_MODULE=<playwright/index.mjs> node tests/manual-pipeline-browser.mjs`: Chromium real, componente desktop e página móvel/layout/proxy reais em fixture loopback; respostas API sintéticas, rede externa bloqueada. Capturas em diretório único. Não é login/E2E de produção.
- `PG_MODULE=<pg/lib/index.js> PG_FIXTURE_SOCKET=<scratch/socket> node tests/manual-pipeline-concurrency.mjs`: PostgreSQL descartável local, banco vazio `postgres`, usuário de fixture, Unix socket, porta 55481. Recusa host TCP; usa duas conexões para concorrência/ownership/legado. Inicializar instância isolada, nunca reutilizar um banco real.

- `UI_RESULTS_DIR=<scratch/pasta-nova> PLAYWRIGHT_MODULE=<playwright/index.mjs> node tests/manual-pipeline-modal-browser.mjs`: modal/componente reais em Chromium 1440/390; GET terminal (inclusive corpo não JSON), retry transitório, callback único, funil/etapa e refresh HTTP/rede falho sem nova escrita. APIs sintéticas e componentes acessórios isolados.
- `PG_MODULE=<pg/lib/index.js> PG_FIXTURE_SOCKET=<scratch/socket> node tests/manual-pipeline-lock-timeout.mjs`: banco de fixture vazio, porta Unix 55483; quatro conexões, migrations reais 004/006 parcial/038/039/052–057. Com timeouts da sessão desligados, mantém SHARE em auditoria e observa o fence global bloqueando outro comprador; exige retorno automático, rollback e progresso do outro comprador antes de liberar auditoria. Confere restauração de configuração, preflight enrollment NOWAIT e triggers reais sem mensagens. Watchdog de 1,5s só libera o holder da fixture para limpeza quando o teste falha; não cancela o RPC.

Ferramentas de fixture (Playwright/PostgreSQL/pg) ficam fora do projeto; não adicionar credenciais ou `.env` para rodar os testes.
