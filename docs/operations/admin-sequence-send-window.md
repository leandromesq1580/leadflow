# Correção administrativa da janela de uma sequência IA

Operação autenticada por sessão admin (`buyers.is_admin === true`):
`POST /api/admin/sequences/<sequence_id>/send-window`.

Corpo obrigatório e exclusivo: `buyer_id`, `expected_start`, `expected_end`, `start`, `end`.
Horas no formato `HH:mm`. O início é inclusivo; o fim, exclusivo, conforme `nextSendAt`.
Sem suporte a janela que cruza meia-noite, como a configuração IA existente.

## Escopo

- Altera só `ai_config.start`/`end` e o carimbo de atualização da sequência indicada.
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
Nenhuma migration ou credencial nova. Testes usam dados sintéticos e não enviam mensagens.

## Operação

Com autorização de alteração dos dados do comprador, usar `l4p-admin` e arquivo JSON;
confirmar a janela com consulta somente-leitura ao banco. A publicação da rota requer
PR, validações e autorização própria. Não publicar ou escrever via SQL para contornar
uma falha dessa operação administrativa.
