# Incidente: configurações parciais removiam licenças e disponibilidade

Date: 2026-09-16 (America/New_York)
System: API de configurações e distribuição de leads
Severity: perda de configuração; comprador pode parar de receber leads
Status: causa de software reproduzida; ação histórica do cliente não comprovada

## Symptoms / Impact
Comprador ativo e com saldo aparecia como `sem estado — não recebe`. Consulta
somente-leitura confirmou ausência de linhas em `buyer_states` e
`buyer_availability`. Não houve evidência de perda de leads ou de créditos.

## Detection / Investigation
Aviso da fila, conferido no banco e no código da versão `3a6cf50`.
`src/app/dashboard/team/page.tsx:updateMode` envia somente identificação e modo
de equipe para `POST /api/settings`. A rota apagava ambas as coleções antes de
verificar se elas tinham sido enviadas. Reprodução offline da rota real retornou
200 e operações de exclusão nas duas tabelas para esse payload parcial.

## Root Cause
**Confirmado:** ausência de campo era interpretada como substituição por vazio.
Além disso, exclusão e inserção eram requisições separadas: falha na segunda
operação podia deixar o cadastro vazio.

**Não confirmado:** qual requisição causou a perda específica relatada pelo
cliente. Visita à página de equipe não comprova alteração do modo. Não existe
histórico de alterações dessas tabelas entre as evidências consultadas; não
inferir licenças anteriores a partir dos estados de leads já recebidos.

## Resolution / Code affected
- `src/app/api/settings/route.ts`: autentica a sessão, exige proprietário ou admin
  para escrever, valida o payload antes de qualquer alteração.
- Campo `states`/`availability` omitido preserva os dados; array explícito
  substitui a coleção; `[]` significa limpar; `null` e conteúdo inválido são
  rejeitados. Perfil só aceita os campos editáveis listados na rota.
- `src/app/api/admin/buyer-settings/route.ts`: entrada exclusiva de admin para
  recuperação via wrapper `l4p-admin POST /api/admin/buyer-settings`, com
  `buyer_id` e somente os campos confirmados. Reutiliza o mesmo writer validado.
- Migration `048_atomic_buyer_settings.sql`: cria `save_buyer_settings`, restrita
  a `service_role`, com bloqueio da linha do comprador e transação única.
  Falha na inserção desfaz a operação completa, incluindo alterações de perfil.
- A migration cria função e permissões; não restaura nem modifica cadastros.
  Aplicar antes do deploy da rota. Não usar fallback para exclusão não atômica.

## Prevention / Detection next time
`tests/settings-preservation.test.ts` incorpora regressão da rota e SQL real em
PGlite: campos omitidos, payload inválido, autorização, restauração por admin,
substituição explícita, falha injetada na inserção com rollback e isolamento.
Rodar `npm test` e testes focados antes de publicar mudanças de configurações.

Se a fila disser `no_license`, consultar `buyer_states` para o comprador exato;
não concluir que seja conta suspensa. Restaurar somente a lista informada pelo
responsável ou recuperada de fonte confiável, via API autenticada e autorizada.
Não supor todos os estados dos EUA nem deduzir horários anteriores.

## Limits / Related
Essa correção não recupera dados já apagados. A recuperação depende de lista
confirmada. Edições completas antigas em outra aba continuam sendo substituições
explícitas (não há controle de versão/ETag nesta tarefa). O GET legado de
configurações não foi alterado; a proteção introduzida aqui é no POST.
- `src/lib/api-auth.ts`
- `src/lib/availability.ts`
- `src/app/api/admin/delivery-queue/route.ts`
