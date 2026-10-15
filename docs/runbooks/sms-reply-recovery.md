# Recuperação de resposta SMS sem vínculo

## Causa e correção

O recebimento SMS consultava `leads.phone` por sufixo sem remover formatação. Telefones com espaços, parênteses ou hífens podiam não ser encontrados; a resposta era inserida em `sms_messages` com `lead_id=NULL`.

A consulta agora usa `phone_digits` (coluna gerada existente em produção). Somente remetente NANP com país `1` admite o alias cadastral nacional. A conferência final distingue telefone cadastral nacional de telefone com `+` explícito; o remetente do webhook já contém o país e nunca recebe `1` por inferência. A regra existente de desempate pelo histórico de SMS permanece.

## Recuperação administrativa, sem reenviar

Pré-requisito: aplicar `070_link_orphan_sms_reply.sql` antes de publicar a rota.

`POST /api/admin/sms/link-reply`, sessão administrativa validada por `callerBuyer`:

```json
{"message_id":"UUID", "lead_id":"UUID", "expected_owner_id":"UUID"}
```

- Uma mensagem por chamada; somente entrada recebida, órfã ou já vinculada ao mesmo cadastro.
- Confere responsável esperado, telefone internacional completo e SMS de saída enviado antes da resposta.
- Função SQL exclusiva de `service_role`, com lock do cadastro e da mensagem até o commit. Contenção é recusada, não aguardada indefinidamente.
- Altera somente `sms_messages.lead_id`. Não insere cópia, não muda corpo/horário, não envia SMS/WhatsApp/push, não troca dono do lead.
- Não reproduz os efeitos do trigger `AFTER INSERT`: não para sequências antigas nem move cartões. Verifique separadamente inscrições ainda ativas antes de recuperar um caso.
- Sucesso exige releitura do vínculo. Em falha de confirmação, consulte o registro exato antes de repetir; retry do mesmo alvo é idempotente.
- A migration apenas cria a função e suas permissões; não recupera nem modifica mensagens existentes automaticamente.

## Testes

```bash
node --test tests/sms-formatted-phone.test.cjs tests/sms-reply-lead-match.test.cjs
PG_BIN=/caminho/postgresql/bin python tests/sms-link-concurrency.pg.py
```

O primeiro usa serialização Supabase real com transporte sintético e executa a migration real em PGlite. O segundo cria um PostgreSQL local descartável, sem TCP, para testar contenção, ambas as ordens de disputa, rollback e permissões. Nunca aponte testes para produção.

A revisão independente do primeiro commit encontrou colisão internacional na recuperação e falta de proteção transacional do responsável. A rodada de ajuste foi testada localmente; o delta SQL não passou por segunda revisão independente. Falhas preexistentes da suíte geral e da autenticação compartilhada não pertencem a esta correção.
