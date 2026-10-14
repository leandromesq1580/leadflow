# Campanhas administrativas: autorização limitada à captação Meta

## Incidente e escopo

A autorização do dono dizia respeito aos formulários da Meta, não à base inteira. A seleção antiga permitia importados, cadastros manuais e landing ao registrar consentimento para uma prévia sem filtro de procedência. `lead_language='pt'` não comprova origem nem consentimento.

A investigação e os destinatários originais foram preservados. Esta correção não apaga contatos, não muda clientes, não reenvia mensagens e não altera evidências de envios anteriores. Automação e envio manual dos clientes não fazem parte desta alteração.

## Evidência local antes da alteração

`tests/email-campaign-meta-only.test.ts`, executado sem a migration 068:

- prévia: seis elegíveis quando só um tinha origem Meta;
- autorização final de destinatário importado: `true`, esperado `false`;
- reenvio: dois elegíveis quando só um era Meta.

Saída preservada em `campaign-meta-only-20261014/red-valid.log` no scratch do perfil. Teste adicional depois da revisão reproduziu que um identificador preenchido em contatos importados ainda passava.

## Proteção

Migration 068 exige formulário Meta conhecido e evidência no payload original de polling ou webhook, com identificador correspondente. Identificador isolado, idioma, nome de campanha e confirmação genérica não liberam procedência desconhecida. A seleção dá prioridade ao registro Meta em duplicidades de e-mail; mantém proteção de conflito de idioma, descadastro e endereço bloqueado.

A regra vale para prévia, registro de permissão, agendamento, seleção de reenvio e autorização imediatamente anterior ao transporte. Um snapshot antigo não contorna o bloqueio.

Retirada retroativa é uma ação administrativa explícita: `revoke_non_meta`, `confirm: true`. Retira consentimento só de endereços sem um cadastro Meta comprovado e bloqueia filas pendentes/reservadas não-Meta. Preserva supressões por bounce/descadastro e os estados accepted/delivered/unknown/sending. O registro de auditoria guarda a operação e as contagens. A consulta `policy` permite conferir novamente as permissões e a fila, sem contornar RLS.

## Revisão e limites

Revisão independente do commit `af901089f22d67d80318a6adddb3ceb703ad7da8` encontrou a brecha do identificador sem procedência. A rodada de correção posterior altera apenas a função de procedência na migration e os testes: exige payload de aquisição e formulário conhecido. Esse delta é conferido pelo agente principal e testado novamente, mas **não recebeu segunda revisão independente**. Deve ser informado ao dono antes da publicação.

Não há disparo real de teste. Mensagem já aceita pelo provedor não pode ser recolhida. Gravações e evidências históricas de destinatários indevidos permanecem para auditoria. Fonte desconhecida fica bloqueada até revisão explícita, mesmo que tenha um identificador preenchido.
