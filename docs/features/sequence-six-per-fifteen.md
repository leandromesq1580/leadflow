# Sequências: 6 mensagens e pausa de 15 minutos

Mudança solicitada pelo dono para reduzir o ritmo de WhatsApp. Aplica-se às sequências tradicionais e IA, compartilhando a cota pelo telefone remetente real (não por comprador, sequência, job ou container).

## Regra

- No máximo 6 admissões de WhatsApp por lote/remetente; a 7ª espera sem gastar tentativa e sem avançar o passo.
- Lote completo espera pelo menos 15 minutos após a última finalização; um lote parcial só reinicia após 15 minutos de inatividade desde a maior data entre reserva e finalização, sem envio em voo.
- Contagens independentes para números diferentes; compradores que usam o mesmo número compartilham a cota.
- E-mail/passos sem WhatsApp não consomem essa cota. Agenda, repetição por lead e proteções de parada/resposta seguem iguais.
- Uma entrega `unknown` mantém o número bloqueado mesmo que a pausa expire. Esta alteração não libera históricos nem reenvia mensagens.
- Ritmo menor não garante ausência de bloqueio pelo WhatsApp; não comprova a causa do bloqueio relatado.

## Publicação

1. Revisar e aplicar `supabase/migrations/060_sequence_six_per_fifteen.sql` com autorização, antes do merge/deploy web. As versões atuais dos executores já chamam essas funções do banco; a alteração entra em vigor no commit da migration.
2. A migration mantém reservas e registros históricos, inclusive lotes com `used` de 7 a 10. Não endurece a constraint antiga para não apagar/resetar esse estado; novas admissões são limitadas pelas funções a 6.
3. A migration **reescreve somente a pausa dos remetentes com reservas**, estendendo para pelo menos 15 minutos a partir da aplicação (e preserva esperas maiores). Não altera créditos, inscrições, estágios, mensagens, estados desconhecidos nem habilita sequências.
4. Publicar web para mostrar a nova regra no texto existente da tela de Sequências, sem controles extras.
5. Conferir as seis funções, pausa dos remetentes e preservação dos registros `unknown` por leitura. Não executar envios reais só para smoke-test sem autorização específica.

## Verificação local

- `node --test tests/sequence-batch-sql.test.cjs tests/sequence-batch-six-fifteen.test.cjs`
- `L4P_TEST_PG_ROOT=<binários locais> <python com psycopg> tests/sequence-batch-pg-concurrency.py` — cluster descartável via socket Unix, schema sintético, sem produção.
- `node --import tsx --test tests/sequence-batch.test.ts` e suítes relevantes de sequências.

Logs devem conter horário, saída e código de encerramento reais. Uma build não confirma conexão de WhatsApp ou ausência de bloqueio futuro.
