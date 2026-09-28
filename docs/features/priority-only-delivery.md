# Entregar somente aos prioritários

Implementação local, não publicada. Base: `de0b968d5fa869372e3cb3c7925dbdf8b775ec5c`.

## Contrato

- `settings.lead_routing.priority_only` é booleano; ausente equivale a desligado. Sem variável nova ou ativação automática. **Requer a migration incremental local `049_priority_only_atomic_delivery.sql` antes de uma futura publicação**, sujeita a autorização separada; não foi aplicada em banco remoto.
- O switch na Regra do Administrador salva imediatamente via `PATCH /api/admin/priority-only`, autenticado por sessão + `is_admin`. Não altera destinatários, proporção, teto, fallback ou etapas. Alterações não salvas da regra são identificadas como rascunho e impedem ligar o switch até salvar. Desligar continua permitido. O aviso de seleção vazia usa a seleção salva, não o rascunho.
- Ligado: os leads automáticos do sistema (`meta_lead_id`) em PT e ES só entram nos compradores de `admin_rule.admin_emails`. Usa crédito líquido do próprio idioma, atividade, licença, disponibilidade e teto diário. A proporção fica suspensa, mas armazenada. Tenta outro prioritário elegível se o primeiro não puder receber. Sem elegível, permanece pendente; nenhum fallback externo.
- No modo exclusivo, inclusive funcionários precisam de crédito. A exceção gratuita da regra anterior permanece somente com o switch desligado. Os limites diários mantêm a leitura por idioma existente. Estado ausente ou licença incompatível deixa o lead pendente, sem inferir estado nem usar fallback; sem licenças o comprador continua `no_license` na fila.
- Guardas em `tryAdminRule`, `forceAssignRoundRobin` e `distributeLeadToNextBuyer` cobrem webhook, poll, reprocessamento de pendentes e `/api/admin/redistribute`. Erros de settings interrompem a decisão. A migration 049 substitui o RPC pago mantendo assinatura, `search_path` e execução exclusiva por `service_role`. A ordem de locks é settings (`SHARE`) → comprador (`NO KEY UPDATE`) → lead → créditos ordenados por ID. Sob os locks revalida seleção/configuração salva, atividade, idioma, licença, disponibilidade e teto antes da atribuição/débito; sem mutex JS. Conta atribuições Meta por comprador/idioma no dia `America/New_York`, com limites de meia-noite calculados pelo fuso, não offset fixo. Manual não entra no teto. A disponibilidade é relida no SQL após o lock do comprador, usando `clock_timestamp()` após os locks e a mesma regra de `availability.ts` (fuso predominante dos estados, desempate leste, DST, período/horas, zero linhas = sempre). Não existe campo `enabled` nesse schema. Salvamentos por `save_buyer_settings` (048) adquirem o lock do comprador antes de substituir horários/estados.
- `cold-leads.ts` também restringe seleção, atividade, crédito `cold_lead` por idioma, licença, horários e teto. Essa função não tem caller no código atual; mantém o mecanismo legado de atribuição em lote, sem introduzir um novo débito de créditos frios.
- Agendamentos e importações/manuais não mudam. Fila administrativa mostra restrição e motivo de pendência em ambos os idiomas.
- Salvamentos de flag, ordenação, formulário e contadores do poll usam compare-and-swap JSONB, evitando que um snapshot antigo desligue o switch ou reverta contadores.

## Evidências locais

Logs em `/home/hermes/.hermes/profiles/lead4pro/cache/scratch/priority-*`.
Ambiente limpo `env -i PATH="$PATH" HOME="$HOME"`, sem `.env`, com `NODE_OPTIONS=--require=.../priority-offline.cjs` bloqueando fetch/rede externa (IPC local permitido).

Tabela histórica da primeira rodada; resultados da segunda/última rodada estão na seção correspondente abaixo.

| Comando | Base | Alteração |
|---|---|---|
| `npm test` | 147 testes, 146 passam, 1 falha | 165 testes, 164 passam, mesma falha |
| `tsx --test tests/priority-only.test.ts tests/priority-only-db.test.ts` | REDs registrados antes das respectivas implementações | 18 passam (14 aplicação/UI + 4 SQL) |
| `node --test tests/admin-rule.test.cjs tests/staff-routing.test.cjs tests/meta-poll.test.cjs` | 38 passam | 38 passam |
| `npm run build` offline | exit 0, 126 páginas | exit 0, 127 páginas |
| `npm exec -- tsc --noEmit` | falhas preexistentes | nenhum diagnóstico novo normalizando caminhos/linhas |
| ESLint dos fontes tocados + teste novo | 44 erros, 2 avisos | 40 erros, 2 avisos |
| `git diff --check` | — | exit 0 |

A falha de baseline é uma asserção textual em `automation-scheduling.test.ts`, que exige um cast `as any` já ausente na base; não é falha de timers nesta máquina (Node 22.23.2). Build ignora erros de tipos pela configuração existente, por isso `tsc` foi executado separadamente.

REDs: `priority-red-1.log` (lista vazia entregava), `-2` (selecionar elegível PT/ES), `-3` (escape do pool), `-4` (horário), `-5` (novo endpoint ausente), `-6` (switch ausente), `-7` (fila), `-8` (leads frios). Integração HTTP adicional reproduz o escape contra a cópia da base em `priority-red-integration-baseline.log`. Resultado final: `priority-final-feature.log`, `priority-new-test.log`, `priority-new-cjs.log`, `priority-new-build.log`, `priority-new-tsc.log`, `priority-new-lint.log`.

Mocks de aplicação são de I/O: Supabase, Meta, notificações/tarefas externas. Distribuição, política, cálculo de saldo e disponibilidade são reais. Teste adicional da interface executa componente/handlers reais, hooks com agendamento simulado, fetch simulado e renderização React estática: desmarca seleção salva → não permite ativar → salva por CAS → PATCH apenas da flag → aviso acompanha seleção salva mesmo após nova edição. Interação em DOM/navegador NÃO VERIFICADA.

### Correções da revisão independente

- P1: `priority-fix-red-db.log` reproduz duas atribuições com teto 1 (`2 !== 1`). `priority-fix-red-db-policy.log` também reprova seleção removida/configuração alterada e teto por idioma. `priority-fix-green-db.log`: 3/3 após revalidação SQL. A bateria final inclui 4 testes SQL, executando migrations 046 e 049 em PGlite isolado, sem mock de RPC; valida débito, seleção, atividade, licença/estado ausente, dia/idioma, retry e privilégios.
- P2 estado: `priority-fix-red-state.log`: 2 falhas, aplicação e SQL entregavam sem estado; `priority-fix-green-state.log`: 17/17 após guardas. Cobre PT/ES, todos os entrypoints, comprador com/sem licença, fila `no_license` e OFF preservado.
- P2 UI: `priority-fix-red-ui.log`: botão permitia ativar seleção salva A exibindo rascunho vazio (`false !== true`). `priority-fix-green-ui.log`: 14/14 após distinguir salvo/rascunho e bloquear ativação até salvar.
- Verificação final: `priority-fix-final-feature.log` (18/18), `priority-fix-verification-summary.json` (totais e comparação normalizada), `priority-fix-test.log` (164/165, única falha de baseline), `priority-fix-cjs.log` (38/38), `priority-fix-build.log` (exit 0, 127 páginas), `priority-fix-tsc.log` (mesmos 17 diagnósticos, sem novos após normalização), `priority-fix-lint.log` (40 erros/2 avisos, igual à implementação anterior). Build em cópia isolada `priority-fix-build-code`, sem `.env`. `git diff --check` exit 0.

### Segunda e última rodada corretiva

- **P1 gratuito (RED → GREEN):** `priority-fix2-red-free.log` mostra fallback e staff retornando comprador depois de ligar a flag. Os dois callers automáticos de `assignLeadToBuyer` agora usam `assign_automatic_free_lead`, adicionado à migration 049, com `settings SHARE → buyer NO KEY UPDATE → lead FOR UPDATE`. Releitura dentro da transação recusa toda entrega gratuita de lead Meta no modo ONLY, mesmo a funcionário selecionado. Retorno false/erro não notifica nem coloca em pipeline. OFF mantém fallback/staff sem exigir crédito, e retry não produz nova entrega. Caminhos manuais não foram redirecionados. Testes SQL executam a função real e conferem lead/crédito e privilégios.
- **P2 disponibilidade (RED → GREEN):** `priority-fix2-red-availability.log` reproduz snapshot 24/7 → chamada real de `save_buyer_settings` da 048 gravando janela indisponível → entrega/débito indevido pelo RPC pago. Após rechecagem SQL, lead permanece `new`, sem dono/crédito, e saldo não é debitado. `priority-fix2-green-db.log` registra 6/6 antes da matriz de paridade adicional. Matriz final compara SQL e TS para todos os estados/DC, sem estados/desconhecido, predominância/desempate, verão/inverno, transições DST, sábados/domingos, limites horários, horas granulares, null/[] e ausência de linhas. AZ mantém `America/Denver`, exatamente como a regra TS existente, sem corrigir fuso fora do escopo.
- **UI entre abas (RED → GREEN):** `priority-fix2-red-ui.log` registra seleção salva desatualizada. PATCH agora devolve somente flag e campos administrativos permitidos (`admin_emails`, `one_in`, `daily_quota`, `daily_max`); nenhum objeto completo de settings. A UI atualiza a regra salva e o rascunho apenas se este continua limpo; desativação preserva rascunho sujo. Teste confere resposta sem campo extra e reconciliação da seleção/aviso.
- **Verificação final:** `priority-fix2-feature.log`: **21/21** (14 aplicação/UI + 7 SQL); `priority-fix2-cjs.log`: **41/41**; `priority-fix2-test.log`: **167/168**, somente a falha textual de baseline em `automation-scheduling`; `priority-fix2-build.log`: **exit 0**, 127 páginas em cópia isolada `priority-fix2-build-code`, sem `.env`; `priority-fix2-tsc.log`: mesmos **17 diagnósticos**, nenhum novo após normalização. `priority-fix2-verification-summary.json` consolida resultados.
- **Lint:** `priority-fix2-lint.log` tem **60 erros/2 avisos** no escopo ampliado. No escopo da rodada anterior, continuam 40 erros/2 avisos, sem novos diagnósticos normalizados. Os 20 adicionais vêm do teste legado `lead-language-routing.test.ts`, agora adaptado ao RPC gratuito (19 `any`, 1 variável `module`). A execução isolada de lint desse teste na cópia anterior foi bloqueada pelo limite de inspeção do lifecycle guard; não foi contornada. Não declarar lint limpo nem baseline executado para esse escopo adicional.

### Correção local do contador sequencial (follow-up)

- Reprodução runtime do GET real de `poll-leads` e da distribuição real, substituindo apenas I/O. Leituras de settings retornam `structuredClone` e a fixture verifica o CAS; mutações no snapshot do poll não alteram os dados persistidos por referência.
- `priority-fix3-red-sequential.log`: as quatro transições OFF→ON (PT/ES × A≠B/A=B) entregavam ao prioritário, mas incrementavam indevidamente a etapa de 0 para 1. Os quatro controles OFF passaram. TAP registra 4 passes/5 falhas porque a falha do teste-pai também entra na contagem.
- Correção mínima: o resultado de `forceAssignRoundRobin` recebe `assignmentPolicy: 'priority_only'` quando produzido pelo guard ONLY; o poll não incrementa nem o snapshot local nem o contador persistido nessa situação. Não se infere a política apenas pelo email ou pelo estado atual do switch. O marcador é de aplicação, não um novo campo de banco ou metadado retornado pelo RPC.
- A matriz final tem 12 cenários (PT/ES × A≠B/A=B × OFF→ON/OFF/OFF→ON→OFF), com três leads por cenário. Com OFF, as etapas avançam normalmente; ao desligar novamente antes da contabilização, a entrega ONLY não consome a etapa e as seguintes retomam a programação.
- O aviso de funcionários agora distingue ON (exige e consome crédito do idioma) de OFF (mantém a exceção gratuita). `priority-fix3-red-ui.log` reproduz a promessa gratuita incorreta no HTML renderizado; a interação real do componente passa após a correção, sem teste de regex sobre código-fonte.
- `priority-fix3-feature.log`, comando `node --import tsx --test tests/priority-only.test.ts tests/priority-only-db.test.ts`: **34 testes, 34 passam, 0 falham**, exit 0. Inclui os sete testes SQL PGlite já existentes. `priority-fix3-green-sequential.log` registra a matriz inicial 9/9; `git diff --check` exit 0.
- **Verificação ampla reexecutada após autorização local:** `priority-final-validation-summary.json` e `results.json`, no scratch do perfil, registram comandos e saídas. Feature **34/34**; suíte **180/181**, baseline **146/147**, mesma falha textual `automation-scheduling`; CJS focado **41/41**, base **38/38**; CJS completo **94/99**, base **91/96**, mesmas cinco falhas de importação `./i18n`. Build offline **exit 0** em ambas as versões. Typecheck: **17 diagnósticos versus 19**, nenhum novo normalizado; lint TS/TSX tocados: **60 erros/2 avisos versus 64/2**, nenhum novo normalizado. Não declarar lint/typecheck limpos: o build ignora erros de tipos. `git diff --check` exit 0; arquivos do checkout preservados pela validação. A revisão independente e o ensaio multi-conexão ainda são requisitos pendentes; nenhum resultado local autoriza publicação.

## Ordem de uma eventual publicação (NÃO autorizada)

1. Revisão final independente e ensaio PostgreSQL multi-conexão: flag OFF→ON versus ambos os caminhos gratuitos, save da 048 versus entrega paga, dois leads disputando teto/crédito; testar ambas as ordens de commit e ausência de deadlocks. Validar também com a linha `settings.lead_routing` existente, como exige a serialização por row lock.
2. Conferir schema anterior: `buyer_availability` da 002 e `hours` da 030, RPC pago da 046 e salvamento transacional da 048. Após autorização específica, aplicar **049 completa antes do código** e confirmar funções/permissões/reload do schema PostgREST. Até lá a implementação permanece local. Ausência do novo RPC deve falhar fechada, sem restaurar UPDATE direto.
3. Somente após outra autorização, publicar aplicação; flag continua desligada/ausente até ação administrativa. **Nenhuma variável de ambiente nova.** Não remover 049 enquanto existir versão do código que chama o RPC gratuito; rollback da aplicação não autoriza rollback do banco.

## Roteiro de revisão de UI (ambiente de teste, não produção)

1. Admin → Configurações → Roteamento → Regra do Administrador: switch começa desligado quando flag ausente.
2. Salvar destinatários e regras; ligar switch; recarregar e conferir seleção/proporção/teto preservados.
3. Fila de Entregas PT e ES: somente prioritários; zero elegíveis mostra pendência sem fallback. Um elegível no estado recebe com crédito do idioma; outro comprador nunca recebe.
4. Desligar e recarregar: seleção e roteamento anterior permanecem. Conta sem admin recebe 403; sem sessão, 401.
5. Em duas abas, alterar contador/ordenação enquanto salva flag; nenhuma atualização pode reverter o switch.

## Limitações para revisão

Não houve contato com produção, segredos, banco remoto, deploy, commit ou push. A proteção transacional nova depende de aplicar a migration 049, ainda NÃO autorizada/aplicada remotamente. Não há `postgres`/`initdb` local disponível: PGlite executa PostgreSQL/WASM com uma sessão; `Promise.all` nele verifica rechecagem efetiva no banco, **não comprova contenção entre conexões nem ausência de deadlocks**. Teste PostgreSQL multi-conexão continua necessário para validar a concorrência real antes da publicação. A disponibilidade agora é revalidada pelo RPC pago em ONLY, mas a prova de interleaving local é sequencial em uma sessão, não uma disputa real de locks. A rotina legada de leads frios, sem caller atual, mantém UPDATE em lote e pré-checagem na aplicação: **não participa da nova serialização SQL e não possui atomicidade completa de política/teto/disponibilidade**. Não foi redesenhada contabilmente. Entrega local para revisão final independente; defeitos remanescentes devem ser escalados, sem outra rodada automática. Não é aprovação de release nem anúncio de correção em produção.
