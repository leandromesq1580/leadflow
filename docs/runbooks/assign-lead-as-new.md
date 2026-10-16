# Atribuir lead como novo

## Regra de produto

Opção exclusiva de administrador no menu do card do pipeline, separada de atribuir ao time. O administrador escolhe um cliente de toda a base; não há sorteio nem filtro de disponibilidade. A origem precisa pertencer a administrador. O crédito já consumido pelo dono anterior **não é devolvido**. O destinatário gasta um crédito `lead` válido e líquido no idioma (`pt`/`es`), inclusive se também for administrador.

O destinatário recebe **um novo atendimento**, não uma alteração da data de captação original:

- Novo UUID, `created_at = assigned_at` no instante da entrega, lead quente/atribuído, primeira etapa do único funil padrão do destinatário.
- Só os dados cadastrais são copiados. Notas, tarefas, mensagens, anexos, membros, pontuação e histórico privado não são transferidos.
- A origem fica arquivada no dono administrativo, preservando Meta ID, data original, conteúdo, crédito e recibos. Os vínculos recíprocos são imutáveis; essa origem não pode voltar a ser ativa.
- A nova entrega não é uma nova captação Meta. `redelivery_source_id` e o registro administrativo provam a origem; nunca fabricar Meta ID para habilitar um aviso.
- Débito, arquivo da origem, novo cadastro, cartão, recibo e efeitos pendentes são uma transação. Falha em qualquer parte desfaz todas as mudanças.

## Bloqueios

Sem crédito líquido/idioma, comprador inativo, funil padrão ausente/ambíguo, origem não administrativa, arquivada, fechada, bloqueio de contato ou envio anterior reservado/sem confirmação: não entregar nem debitar. Não remover STOP/supressões para tentar novamente. Inscrições anteriores são encerradas e SMS agendados são cancelados, sem apagar registros.

A origem pode ser entregue uma vez. Repetição para o mesmo destinatário, inclusive com novo identificador de tentativa, devolve o resultado existente sem outro débito. Destinatário diferente após conclusão é conflito, não uma segunda venda.

## Componentes

- `supabase/migrations/071_admin_new_lead_assignment.sql`: operação transacional, recibos, autorização, pesquisa, consulta de resultado, fila de efeitos e barreiras contra trabalho antigo.
- `src/lib/admin-new-lead-assignment.ts`: validação e confirmação do resultado persistido.
- `src/app/api/admin/leads/assign-as-new/route.ts`: autenticação do administrador.
- `src/app/dashboard/pipeline/assign-lead-as-new-dialog.tsx`: busca, confirmação, crédito e recuperação de tentativa incerta.
- `src/lib/admin-new-lead-assignment-effects.ts`: efeitos duráveis drenados pelo `poll-leads`, independentemente da disponibilidade do token Meta.
- Webhooks SMS/WhatsApp ignoram especificamente `redelivered_to_lead_id IS NOT NULL`, preservando a regra normal dos demais cadastros.
- Notificador aceita entrega administrativa somente com prova no registro privado. SMS automáticos precisam reservar o envio antes do transporte; uma origem encerrada não pode obter a reserva.

## API

Autenticação de administrador obrigatória, cache privado/desabilitado.

- `GET /api/admin/leads/assign-as-new?lead_id=<uuid>&q=<nome-ou-email>&cursor=<uuid>`: busca literal, 50 clientes por página, saldo líquido por idioma e motivo de inelegibilidade.
- `POST /api/admin/leads/assign-as-new`: `{lead_id,to_buyer_id,request_id}`. Retorna novo lead, comprador, horário de entrega, saldo após a operação, replay e aviso pendente. Não envia mensagens durante o POST.
- `GET /api/admin/leads/assign-as-new?lead_id=<uuid>&request_id=<uuid>`: consulta o resultado sem cobrar. `{pending:false,committed:false}` significa que não há entrega confirmada nessa leitura; não prova que outra requisição ainda em andamento falhará.

Em perda de conexão, a tela congela o destinatário e reutiliza o mesmo pedido. A tentativa fica no `sessionStorage` mesmo ao fechar/reabrir. Nunca trocar destinatário nem gerar novo pedido para resolver resultado incerto.

## Avisos e automações

Efeitos são persistidos junto à entrega e executados pelo poll, normalmente no ciclo seguinte. O aviso usa o canal normal da plataforma; as automações ficam limitadas ao novo lead e as inscrições não reativam registros parados.

Sem canal disponível, o aviso continua pendente. Transporte de resultado ambíguo fica `unknown`, não é reenviado automaticamente: canais externos não oferecem confirmação transacional junto ao banco. A tela confirma **entrega**, não chegada de WhatsApp no aparelho.

Para investigar: consultar `admin_new_lead_assignments`, `admin_new_lead_assignment_requests`, `admin_new_lead_effects`, `lead_delivery_receipts` e a linha do novo lead. `done` de efeito não equivale a leitura pelo comprador. Em `unknown`, cruzar comprovantes do provedor/canal antes de qualquer reenvio; reenvio é ação externa que exige autorização. Não limpar o estado para forçar nova cobrança/envio.

## Publicação

1. Revisar o commit exato e comparar suite/build/types/lint com a base; validar API, SQL, concorrência e UI localmente.
2. Obter autorização explícita para migration e publicação. O pedido de publicar **não autoriza entregar um lead real nem descontar crédito para smoke test**.
3. Integrar à `main` atualizada, aplicar migration 071 antes do código e publicar pelo fluxo autorizado do projeto. Verificar SHA/alias do build realmente em produção.
4. Fazer verificação somente leitura de funções/permissões e consulta administrativa. Teste de uma entrega real exige origem e destinatário escolhidos/autorizados; nunca usar um cliente sem autorização.
5. Não remover tabelas/colunas em rollback. Se já houve uma entrega, reverter para código que ignora os vínculos pode fazer respostas voltarem à origem antiga. Desabilitar a entrada da feature preservando as proteções de mensagens e histórico é mais seguro.

## Verificação local

Dados e transportes sintéticos, sem `.env` nem serviços externos:

```sh
node --import tsx --test tests/admin-new-lead-assignment*.test.ts
node --import tsx tests/admin-new-lead-assignment-concurrency.ts
node --import tsx --test tests/sms-formatted-phone.test.cjs tests/sms-reply-lead-match.test.cjs tests/wa-brazil-phone.test.ts tests/wa-webhook-content.test.ts
NEWLEAD_UI_TOOLS=<diretorio-playwright> NEWLEAD_UI_OUTPUT=<diretorio-novo> node tests/assign-lead-as-new.ui.mjs
NEWLEAD_UI_TOOLS=<diretorio-playwright> NEWLEAD_UI_OUTPUT=<diretorio-novo> node --import tsx tests/assign-lead-as-new.integration.ui.mjs
```

O teste integrado monta o componente real, passa pelo controlador real e executa a migration e o recibo reais em PGlite. Autenticação e transportes são explicitamente sintéticos. Concorrência usa PostgreSQL local com socket privado e encerra o cluster ao terminar. Diretórios de evidência devem ser novos por rodada; nunca reaproveitar uma saída antiga como resultado atual.
