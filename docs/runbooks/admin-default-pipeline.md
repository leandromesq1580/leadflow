# Reparar funil padrão ausente (admin)

`POST /api/admin/buyers/<buyer_id>/default-pipeline`

Operação **somente para ausência de padrão**, não troca de funil. Usa sessão
verificada (`auth.getUser`) e exige `buyers.is_admin === true`. Corpo estrito:

```json
{"pipeline_id":"22222222-2222-4222-8222-222222222222"}
```

IDs acima são sintéticos; use apenas IDs exatos, canônicos (UUID em minúsculas),
confirmados e autorizados. Não normalizar identificadores fornecidos pelo operador.
O funil precisa pertencer ao comprador do caminho e ter ao menos um estágio.

## Execução autorizada

1. Confirmar publicação da rota e autorização para o comprador/destino exatos.
2. Ler pipelines e estágios do comprador pelo acesso somente-leitura existente;
   confirmar ausência de padrão. Guardar snapshot privado de flags e contagens de
   cartões, sem incluir dados pessoais no repositório.
3. Coordenar janela **sem edição concorrente de pipelines** (UI, outra rota ou
   outro operador), inclusive durante a conferência. Não disparar distribuição,
   cron, sequência ou atribuição de teste em produção.
4. Invocar o wrapper existente, sem alterar sua allowlist ou autenticação:

   ```bash
   /home/hermes/.hermes/profiles/lead4pro/bin/l4p-admin POST \
     /api/admin/buyers/<buyer_id>/default-pipeline \
     '{"pipeline_id":"<pipeline_id>"}'
   ```

5. Exigir HTTP 200, `success:true`, `future_leads_only:true`, `default_count:1`
   e `pipeline:{id,buyer_id,is_default:true}` com os IDs exatos. `changed:false`
   significa replay idempotente de um padrão já único; não houve UPDATE.
6. Reler o comprador/destino no banco: exatamente um padrão e no alvo autorizado,
   outros funis intactos, cartões antigos preservados. Observar entregas naturais
   futuras separadamente: sucesso da configuração não prova uma nova entrega.

## Limites e erros

- A rota faz **no máximo um UPDATE**, somente `{is_default:true}`, com filtros
  por `buyer_id`, `id` e flag observada. Nunca desmarca outro padrão, altera outro
  comprador, move/cria cartões, reatribui leads ou inscreve sequência.
- O efeito é na escolha do funil usada pelas atribuições futuras existentes.
  Leads antigos sem cartão continuam sem cartão. A distribuição e suas automações
  existentes não são modificadas; uma atribuição já em voo pode ter lido a
  configuração anterior.
- 401: sem sessão válida; 403: sessão sem admin; 400: corpo/IDs inválidos;
  404: destino inexistente ou não pertencente ao comprador; 409: outro padrão,
  múltiplos padrões ou destino sem estágios. **Não resolver limpando flags.**
- 503 `query_unavailable` / `reconcile_required:false`: não iniciou escrita;
  falha de consulta não é ausência. Não presumir configuração aplicada.
- 503 `reconcile_required:true`, timeout ou resposta perdida: **parar e reler o
  estado antes de qualquer retentativa**. O UPDATE pode ter sido confirmado;
  não há rollback automático. Não repetir em lote nem limpar defaults.
- Readback consulta alvo e padrões no mesmo snapshot, com contagem exata e
  estágios. Confere propriedade, flag e padrão único; conflito detectado retorna
  reconciliação, nunca sucesso. Isso **não fornece exclusão mútua global**:
  não há índice único parcial nem RPC transacional para esse invariante. Outra
  rota pode escrever depois do readback (ou criar estados transitórios entre
  leituras). A coordenação operacional é obrigatória. Garantia global exigiria
  projeto/aprovação separados para banco e todos os writers; nenhuma migration
  acompanha esta operação limitada.

## Verificação local

`node --import tsx --test tests/admin-default-pipeline.test.ts` carrega o handler
real, `NextRequest`/`NextResponse` e o serializer Supabase real, substituindo
somente sessão/client factory e transporte por fixture sintética em memória.
Cobre autorização, validações, isolamento, idempotência, falhas/ambiguidade e
interleavings detectáveis. Não é uma prova de locks PostgreSQL, RLS, PostgREST
remoto ou de comportamento em produção. Use cópia sem `.env*`, ambiente limpo,
bloqueio de rede externa e comparação com o baseline para suite/tipos/build.
