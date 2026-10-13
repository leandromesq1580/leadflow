# Correção administrativa da janela de uma sequência IA

Operação autenticada por sessão admin (`buyers.is_admin === true`):
`POST /api/admin/sequences/<sequence_id>/send-window`.

Corpo obrigatório e exclusivo: `buyer_id`, `expected_start`, `expected_end`, `start`, `end`.
Horas no formato `HH:mm`. O início é inclusivo; o fim, exclusivo, conforme `nextSendAt`.
Sem suporte a janela que cruza meia-noite, como a configuração IA existente.

## Escopo

- Altera `ai_config.start`/`end` e o carimbo da sequência indicada; o trigger existente
  incrementa `reply_move_version`, preservando a proteção de movimentações de resposta.
  Uma movimentação pendente com versão anterior pode ser recusada por `sequence_changed`.
  Essa proteção não é removida. Não há atualização direta dos contatos ou de intenções.
- Preserva configuração completa: intervalo, dias, fuso, instruções e campos desconhecidos.
- Confere comprador explicitamente. Somente modo `ai_until_reply`.
- Não ativa sequência desativada; não toca em contatos, fila, leases, status, histórico ou transporte.
- Não reprograma agendamentos antigos. Contatos já agendados para 9 AM continuam em 9 AM;
  cálculos futuros usarão a nova janela. Uma janela de 8 AM–9 PM não implica envio a cada minuto
  nem antecipação de intervalos de oito horas.

## Concorrência e resultado

A atualização única compara id, comprador, modo, habilitação, carimbo e configuração JSONB
com o snapshot lido. Conflito conhecido retorna 409 e não é tentado novamente. A confirmação
exige um registro afetado e leitura integral da configuração salva.
Um escritor independente pode alterar dados depois da confirmação: isso não é uma trava
permanente nem um bloqueio sobre outras rotas existentes.

Erro de atualização ou leitura posterior retorna 503 com `reconcile_required: true`:
consultar o alvo antes de decidir qualquer tentativa. Não repetir atualização cegamente.
Se já estiver na janela solicitada, responde sem nova escrita.
Migration 067 necessária ANTES da rota. Ela substitui apenas o trigger de reavaliação da
sequência: a exceção é uma edição válida e exclusivamente de janela IA, sem nenhuma outra
mudança na sequência (desconsiderando carimbo e a revisão interna incrementada pelo trigger).
Mudanças de ativação, dono, modo, estágio, instruções ou intervalo continuam reavaliando;
opt-out e demais proteções de envio permanecem. Não atualiza linhas existentes.
A rota exige a função de prontidão service-only e falha antes de escrever se ela faltar.
Nenhuma credencial nova. Testes sintéticos não enviam mensagens.

Regressão local real, separada de `npm test`: instalar `pg` em diretório externo de ferramentas,
inicializar PostgreSQL 16 sem TCP em socket Unix descartável na porta 55432 e executar
`EC_TEST_SOCKET=<socket-local> EC_TEST_TOOL_DIR=<ferramentas> node tests/admin-sequence-window.pg.mjs`
e `node tests/admin-sequence-window-trigger.pg.mjs` com as mesmas variáveis. O segundo usa
migrations reais e compara integralmente inscrições e regras de cancelamento.

## Operação

Com autorização de alteração dos dados do comprador, usar `l4p-admin` e arquivo JSON;
confirmar a janela com consulta somente-leitura ao banco. A publicação da rota requer
PR, validações e autorização própria. Não publicar ou escrever via SQL para contornar
uma falha dessa operação administrativa.
