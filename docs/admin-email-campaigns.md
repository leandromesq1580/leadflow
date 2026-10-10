# Campanhas de e-mail do admin

## Escopo e operação

Página: `/admin/email-campaigns` (atalho no menu do admin).
Campanhas avulsas sobre seguro para a base completa, incluindo leads atribuídos a clientes, sem alterar comprador, créditos ou sequências. O remetente exibido é **Lead4Pro**; conteúdo em português e espanhol conforme idioma efetivo do lead. Não substitui o módulo de sequências nem os e-mails manuais dos clientes.

Fluxo: criar → escrever nos dois idiomas → salvar rascunho → conferir público → registrar permissão documentada quando aplicável → confirmar conteúdo/público → agendar. Toda gravação de permissão é uma declaração explícita do admin com referência e histórico; a migração **não concede consentimento** a ninguém. Quem pediu descadastro não é reativado por essa declaração.

Seleção padrão: todos os leads. Filtros opcionais por cliente, estados, idioma, tipo (quente/frio) e período UTC. Uma campanha considera todos os cadastros selecionados, mas só inclui um endereço por campanha. A prévia explica ausentes, inválidos, repetidos, idioma ausente/conflitante, descadastro/bloqueio e permissão ausente. Idiomas conflitantes para um mesmo endereço são bloqueados mesmo quando um filtro tenta esconder um dos registros. Formulários conhecidos seguem `META_FORM_LANGUAGES`, como as demais notificações.

Ao agendar, conteúdo, público e destinatários ficam congelados. A contagem confirmada é conferida dentro da mesma transação que cria a fila; mudança de contagem devolve conflito e exige nova prévia. Novos leads não entram numa campanha já agendada. São incluídos numa campanha posterior.

Pausa/cancelamento impedem novos envios autorizados. Um e-mail que já estava autorizado e em andamento pode terminar: não existe desfazer um envio. Resultados incertos não são automaticamente repetidos. Cancelamento preserva histórico. Permissão e bloqueio são conferidos novamente antes do envio, inclusive depois do agendamento.

## Configuração antes de produção

Migração: `supabase/migrations/062_admin_email_campaigns.sql`. Cria tabelas e funções novas; **não reescreve nem remove leads, compradores, créditos ou permissões existentes**. Tabelas com RLS e sem acesso direto de anon/authenticated. Funções novas revogadas de PUBLIC/anon/authenticated, concedidas só a service_role. As APIs admin conferem a identidade autenticada exata por `buyers.auth_user_id` e passam o `buyers.id` para as funções SQL, sem herdar permissão do responsável de uma equipe. As referências a leads e compradores novos usam `ON DELETE SET NULL`: exclusões existentes preservam o histórico da campanha, sem impedir a operação. Um lead removido ou com endereço alterado não é enviado pela fila congelada.

| Variável | Uso |
|---|---|
| `RESEND_API_KEY` | Chave do provedor existente; precisa permitir consultar os domínios e enviar |
| `RESEND_FROM_EMAIL` | Endereço próprio, em domínio autenticado; `resend.dev` é bloqueado |
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

## Verificação local (sem .env, credenciais nem mensagens reais)

- `node --import tsx --test tests/email-campaigns*.test.ts`: seleção, consentimento, isolamento, transições, filas, retornos e endpoints com injeção controlada.
- `tests/email-campaigns.pg.mjs`: PostgreSQL 16 **local**, multissessão, socket Unix obrigatório. 20 workers concorrentes, quota global, tempo da reserva após trava, pausa × autorização, descadastro × autorização, finalização × expiração e envio em andamento.
- `tests/email-campaigns.ui.mjs`: página React real + handlers HTTP reais + SQL local com contatos sintéticos; provedor e autenticação injetados. Criação, falha de salvamento sem perder texto, consentimento, preview, agendamento, pausa/retomada/cancelamento, histórico, configuração bloqueada e layout em 1280 px / 390 px. Nenhuma chamada de envio ao provedor.

Para as duas últimas rotinas: `EC_TEST_SOCKET` aponta para o socket Unix do PostgreSQL local na porta 55432; `EC_TEST_TOOL_DIR` aponta para um pacote de verificação com `pg` e `playwright`. A rotina de UI também exige `EC_TEST_OUTPUT` para artefatos. O navegador Chromium de teste precisa estar instalado localmente; nenhum desses utilitários vira dependência do aplicativo. Bases locais sintéticas são preservadas para auditoria; as rotinas não removem dados.

Limites da verificação: UI testada isoladamente com identidade admin injetada, não com login de produção. Entrega real, autenticação do domínio real, plano/quota do provedor e evento real ainda precisam de configuração e autorização. Não enviar um teste real à base.

## Fora da primeira versão

Fluxos condicionais/automáticos, editor visual HTML, cadência individual de retentativa de rejeitados, liberação automática de resultado incerto, testes A/B e envio em nome de cada corretor. O teto diário é configuração de operação, não decisão de envio automático por custo. Nenhuma contagem ou estimativa de custo da base de produção foi inferida a partir das fixtures.
