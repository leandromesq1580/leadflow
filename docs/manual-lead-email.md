# Email manual para leads

Implementado em `feat/email-leads`, na tela **Dashboard → Meus Leads**. Não foi feito commit, push, PR, deploy, alteração de `.env` ou escrita em banco remoto. Os envios autenticados dos testes usam exclusivamente mocks; nenhum email real foi enviado.

## Fluxo

1. Abra **Enviar email aos meus leads** e selecione leads da busca atual (até 20).
2. Preencha assunto e mensagem em texto simples, depois **Ver prévia**.
3. Revise destinatários, remetente, conteúdo e rodapé. Confirme autorização/base legal de contato e respeito a descadastros.
4. Confirme o envio. Cada destinatário recebe uma requisição individual, sem CC/BCC.
5. O resultado distingue **aceito pelo provedor**, **recusado**, **ignorado** e **incerto**. Aceitação não comprova entrega na caixa de entrada.

O formulário tem textos PT/EN/ES, respeita o mascaramento de emails do modo de privacidade e preserva o identificador durante consultas/repetições após falha de rede. Depois de iniciar um envio, o conteúdo fica bloqueado para evitar reutilizar o identificador com outro payload.

## Isolamento e limites

- O backend usa `callerBuyer` / `auth.getUser()`. O dono vem da sessão, nunca de `buyer_id` no JSON.
- Todas as leituras de leads usam `assigned_to = buyer da sessão` e os IDs selecionados. Um ID alheio/inexistente rejeita o lote inteiro, inclusive a prévia, antes de qualquer envio.
- **Não há exceção para administradores, espelhos de agência ou pertencimento a quadro do pipeline.** A feature é para o buyer diretamente autenticado, como a própria página Meus Leads.
- Revalida ownership, email e descadastro antes de cada chamada ao provedor. Alterações depois dessa validação não podem cancelar uma chamada já em andamento.
- Até 20 IDs por lote; assunto até 200 caracteres; corpo até 10.000; limite HTTP real de 64 KiB, inclusive sem `Content-Length`.
- Bloqueia origens cruzadas, exige JSON, valida UUIDs, cabeçalhos e emails. Corpo e prévia não executam HTML.
- Emails normalizados repetidos no mesmo lote são ignorados. Leads sem email válido e descadastrados são ignorados com motivo.
- A reserva SQL serializa por buyer com advisory lock: até 20 destinatários/minuto e 100 em 24 horas, contando reservas, inclusive resultados incertos.

## Idempotência e auditoria

`manual_email_batches` mantém dono, request ID, hash da mensagem/destinatários/configuração, confirmação de autorização, status e resultados. Não armazena corpo/assunto em claro.

- Mesmo buyer + request ID: retorna o resultado anterior, ou bloqueia enquanto estiver `processing`; payload diferente retorna conflito.
- Mesmo hash com novo request ID em até 24h também reutiliza o lote. Isso cobre refresh/nova aba/repetição do formulário.
- A confirmação da prévia é vinculada aos destinatários e conteúdo atuais; alterações exigem nova prévia.
- Cada chamada Resend recebe `Idempotency-Key` derivada do lote e do lead.
- Timeout/5xx/retorno sem ID são incertos. Não há retry automático. Falha ao persistir resultados não é comunicada como sucesso.
- Se uma execução for interrompida, a reserva pode ficar `processing`. Não apagar, liberar ou reenviar automaticamente: conferir o provedor e reconciliar com autorização operacional. Preservar o request ID; criar outro lote após a janela de 24h não é uma recuperação segura.

## Descadastro

`manual_email_preferences` guarda preferência por **buyer + email normalizado**, com token UUID opaco. Inserções repetidas não removem uma supressão. As tabelas têm RLS e acesso apenas pelo service role; browser/anon/authenticated não podem consultar tokens, resultados ou alterar preferências.

O rodapé e os cabeçalhos `List-Unsubscribe` / `List-Unsubscribe-Post` apontam para `/api/leads/email/unsubscribe?token=...`. GET só apresenta confirmação (seguro para scanners); POST registra a supressão, sem login e sem expor o endereço. Há suporte ao POST one-click.

**Escopo explícito:** esse descadastro vale para esta nova feature de emails manuais. As rotas legadas de templates, automações, sequências e notificações não foram alteradas. Não há migração de consentimentos preexistentes, sincronização de bounces/complaints nem comprovação automática de consentimento: o cliente atesta a base legal. Isso não substitui avaliação de compliance para campanhas de marketing.

## Pré-requisitos para habilitar (pendentes de autorização)

1. Revisar e aplicar separadamente `supabase/migrations/048_manual_lead_email.sql`. A migration foi executada **somente em PGlite em memória**, duas vezes para validar reaplicação. Não foi aplicada no Supabase.
2. Configurar no ambiente de execução, sem colocar segredos no código:
   - `RESEND_API_KEY`: integração Resend existente.
   - `RESEND_FROM_EMAIL`: remetente com domínio verificado no Resend, como `Nome da empresa <email@dominio-verificado>`. Não aceita o remetente de teste `onboarding@resend.dev`.
   - `MANUAL_EMAIL_POSTAL_ADDRESS`: endereço postal legítimo incluído no rodapé (obrigatório).
   - `NEXT_PUBLIC_APP_URL`: opcional; origem HTTPS pública, sem caminho/query/credenciais. Padrão `https://lead4producers.com`. Não é inferida do Host enviado pelo cliente.
3. Revisão independente e autorização de publicação/deploy. Não se pode afirmar operação em produção antes desses passos.

Se configuração, tabelas, reserva ou preferências falharem, a feature falha fechada, sem contornar a proteção. A chave e a configuração reais não foram lidas/impressas para validar remetente/entrega.

## Verificação executada

Ambiente de execução observado: Node **22.23.2**, Next **16.2.3**. JSDOM de testes fixado na linha **26**, compatível com Node >=18, para não impor Node 22 ao projeto.

| Gate | Resultado real |
|---|---|
| TDD | Ciclos RED → GREEN observados para ownership, validação, prévia, envio/replay, falhas, quotas, SQL, HTTP, descadastro e UI |
| `npx tsx --test tests/manual-email*.test.ts` | 17 testes da feature passam (também passam na suíte completa final) |
| `npm test` antes | 86 testes: 85 passam, 1 falha |
| `npm test` depois | 103 testes: 102 passam, a mesma falha preexistente |
| ESLint dos arquivos alterados | Exit 0, sem erros/avisos |
| `git diff --check` | Exit 0 |
| `npm run build` final | Exit 0, compilação em 52s; ambas as novas rotas presentes |
| `npx tsc --noEmit` | 19 erros preexistentes; comparação com worktree HEAD: nenhum erro novo |
| `npm audit` | 14 vulnerabilidades já existentes (incluindo 1 crítica); nenhum novo pacote vulnerável introduzido |
| Smoke no `next start` local | GET confirmação 200, token inválido 400, JSON inválido 400, origem cruzada 403, content-type inválido 415, sem sessão 401; todas as respostas `no-store` |
| Revisão local | Scan dos 8 arquivos de produção alterados: sem HTML inseguro, execução dinâmica ou credenciais literais; revisão das regras de ownership, replay e RLS |

A falha da suíte original é `lead distribution triggers automations immediately after pipeline placement`, em `tests/automation-scheduling.test.ts`: assertion baseada em regex do código de distribuição. Não é erro de mock timers neste runtime. O build do repositório usa `ignoreBuildErrors`; por isso o typecheck foi executado separadamente e comparado com baseline. Permanecem warnings preexistentes de configuração `eslint`/metadata do Next.

Revisão independente automatizada não foi executada: não há ferramenta de delegação neste subagente e o CLI `codex` não está instalado. Não há aprovação independente implícita neste relatório.

Logs locais: `/tmp/email-leads-baseline.log`, `/tmp/email-leads-feature-tests.log`, `/tmp/email-leads-final-tests.log`, `/tmp/email-leads-final-build.log`, `/tmp/email-leads-baseline-typecheck.log`, `/tmp/email-leads-final-typecheck.log`, `/tmp/email-leads-baseline-audit.json`, `/tmp/email-leads-audit.json`. O servidor de smoke foi encerrado e o worktree temporário de comparação removido.
