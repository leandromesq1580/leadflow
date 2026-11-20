# Contrato do Manifest de Publicação — Academy (`/academy/`)

Define o único insumo aceito por `scripts/academy-stage.py` para promover
conteúdo da Academy para `public/academy/`. Nenhum arquivo é copiado sem
constar, aprovado e com hash, neste manifesto. Testes de contrato em
`tests/academy_staging_test.py` (16 casos, RED→GREEN).

## Esquema (schemaVersion: 1)

```json
{
  "schemaVersion": 1,
  "publicationApproved": true,
  "reviewedBy": "nome-ou-login-do-revisor-humano",
  "reviewedAt": "2026-11-19T00:00:00+00:00",
  "requiredPaths": ["index.html", "docs/aula1.html", "media/aula1.mp4"],
  "assets": [
    {
      "path": "index.html",
      "source": "index.html",
      "sha256": "<sha256 hex do arquivo de origem>",
      "approved": true
    }
  ]
}
```

Campos exatos, sem extras e sem faltantes, em `manifest` e em cada item de
`assets`.

| Campo | Regra |
|---|---|
| `schemaVersion` | inteiro, deve ser `1` (sem outro tipo, ex. `"1"` rejeitado) |
| `publicationApproved` | deve ser o booleano `true` (string `"true"` é rejeitada) |
| `reviewedBy` | string não vazia — identifica a pessoa que revisou a mídia |
| `reviewedAt` | timestamp ISO-8601 **com timezone** |
| `requiredPaths` | lista completa e sem duplicatas dos caminhos relativos do release; deve conter `index.html` |
| `assets[].path` | caminho relativo de destino (dentro de `public/academy/`) |
| `assets[].source` | caminho relativo dentro do diretório `--source` (cópia privada) |
| `assets[].sha256` | hex de 64 caracteres, hash sha256 do arquivo de origem no momento da revisão |
| `assets[].approved` | deve ser o booleano `true` item a item — aprovação por arquivo, não só do release |

Regras adicionais aplicadas por `validate()`:

- `set(assets[].path) == set(requiredPaths)`: o release deve ser completo —
  nem falta arquivo aprovado, nem sobra arquivo fora do inventário.
- Caminhos (`path` e `source`) passam por `safe_path()`: regex restrito,
  sem `..`, sem componente vazio, sem dotfile.
- `source / asset.source` não pode ser symlink (nem nenhum ancestral) e deve
  ser arquivo regular existente.
- O hash do arquivo de origem é recalculado no momento da cópia; se não
  bater com `sha256` do manifesto, a execução falha antes de copiar.
- `destination` (ex. `public/academy/`) **não pode existir previamente** —
  o script nunca mescla com um diretório já staged; cria um diretório novo,
  escreve em um temporário e faz `rename` atômico ao final, após reler e
  confirmar o conteúdo copiado.

## Uso

```
python3 scripts/academy-stage.py \
  --manifest <manifest.json aprovado> \
  --source <diretório privado revisado> \
  --destination public/academy
```

- `--source` deve apontar só para a cópia privada já revisada (nunca para o
  diretório de originais não tratados).
- Em caso de qualquer violação do contrato, o script falha (`ValueError`)
  **antes** de copiar qualquer byte — não há escrita parcial de material não
  aprovado.
- `public/academy/` está no `.gitignore` do projeto: mesmo um staging válido
  nunca entra no repositório por engano. Commits de código ficam livres de
  mídia.

## Release autorizado (19/11/2026)

- O usuário declarou revisão pessoal dos vídeos/documentos (`ja`, 18:49:56
  -05:00) e autorizou a publicação (`sim`, 18:50:08 -05:00). Isso é
  proveniência declarada, não certificação audiovisual automática.
- `docs/academy-release/manifest.json` fixa os hashes dos 236 arquivos
  sanitizados, incluindo 17 vídeos. `authorization.json` registra a origem
  da decisão, a anonimização adicional de áudio e as limitações dos scans.
- Apenas a simulação IUL National Life foi confirmada fictícia. A autorização
  não permite publicar segredos conhecidos.
- Os arquivos aprovados são versionados explicitamente com `git add -f`;
  o ignore continua protegendo contra inclusão acidental de novos arquivos.
  Não há download externo nem dependência do scratch para servir a Academy.
- Para reproduzir o staging, use `public/academy` de um checkout deste commit
  como `--source`, o manifesto versionado e um destino novo. Confira todos
  os hashes antes da publicação. `.vercelignore` não exclui a Academy.
- Tamanho real medido: 278.814.973 bytes no total, maior arquivo 42.814.694
  bytes (a estimativa prévia de 17 MB/200 MB não corresponde ao candidato).
  Todos estão abaixo do alerta GitHub de 50 MiB e do bloqueio de 100 MiB;
  o projeto Vercel está no plano Pro (upload estático até 1 GB).
- A suíte geral anterior terminou por timeout com 37 falhas em wa-alert-pause;
  não é considerada limpa. Testes focados, build e navegador local têm
  evidências próprias; não equivalem a verificação de produção.
