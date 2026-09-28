# Deploy — web/API (Vercel)

> Deploy em produção **sempre exige autorização explícita do Leandro** ("sim" no chat).
> Ler, editar código local, rodar lint/test/build são verdes; deploy é amarelo.
> **Mesclar um PR na `main` JÁ É deploy**: a integração Git da Vercel publica cada commit da
> `main` em produção (comprovado 28/09/2026 pelo `githubCommitSha` dos deploys). O merge,
> portanto, também exige o "sim".

## Fluxo completo

1. `git checkout main && git pull --ff-only`; criar branch `fix/<assunto>` ou `feat/<assunto>`.
   ⚠️ A cópia de trabalho tem que estar na `main` atualizada. Em 27/09 dois lados publicaram de
   branches divergentes (`main` × `fix/settings-preserve-licenses`) e cada deploy apagou o
   trabalho do outro — ver `docs/incidents/2026-09-27-deploy-branches-divergentes.md`.
2. Reproduzir o problema (log, teste falhando, endpoint) e mostrar a evidência
   **antes** de editar.
3. Editar. Rodar:
   ```bash
   npx eslint $(git diff --name-only main -- '*.ts' '*.tsx')   # lint só nos arquivos tocados
   npm test                                                     # node:test
   npm run build                                                # obrigatório se mudou página/API
   ```
   Colar a saída real. Teste que não rodou = "NÃO VERIFICADO".
4. Commit em PT-BR no padrão do repositório (`fix(escopo): ...`, `feat(escopo): ...`).
5. `git push -u origin <branch>` e `gh pr create --fill --base main`. Push direto na `main`:
   nunca — e desde 28/09/2026 o GitHub **rejeita** (`GH013`): a `main` é protegida, só entra por
   PR com o check "Vercel" verde. `gh` precisa estar logado (`gh auth status`); no hermes-srv o
   login é passo do Leandro (`gh auth login --web --git-protocol ssh --skip-ssh-key`).
6. Mesclar (amarelo, com o "sim"): `gh pr merge <n> --squash --auto` — mescla quando o check
   passar e apaga a branch (`delete_branch_on_merge`). `BLOCKED`/`REVIEW_REQUIRED` em `gh pr view`
   = a proteção está pedindo revisão que a conta única não pode dar → avisar o Leandro
   (Settings → Branches → main → "Require approvals" = 0), nunca contornar.
7. Depois do merge, esperar o deploy automático (~40 s): `l4p-vercel ls leadflow --prod` mostra
   deploy novo `● Ready`. **Deploy manual só como reserva** (deploy automático não apareceu em
   5 min), com o "sim" explícito do Leandro — **só com a cópia exatamente na `main`**:
   ```bash
   cd ~/DEV-APPS/leadflow-agent && git checkout main && git pull --ff-only
   git fetch origin && test "$(git rev-list --count HEAD..origin/main)" = 0 || echo "❌ NÃO PUBLIQUE: HEAD está atrás de origin/main"
   /home/hermes/.hermes/profiles/lead4pro/bin/l4p-vercel deploy --prod --yes
   ```
   (Fora do Hermes, `scripts/deploy-prod.sh` faz a mesma trava — HEAD tem que ser EXATAMENTE
   `origin/main`; ele não faz mais push, porque a `main` é protegida.)
   **Nunca publicar de uma branch `fix/*`/`feat/*`**: o que está no ar tem que ser exatamente a `main`.
   **Nunca** `~/.local/bin/vercel` direto — o scanner de segurança do Hermes bloqueia
   caminhos relativos e chamadas diretas.
8. Verificar:
   ```bash
   curl -sI https://lead4producers.com   # confirmar "server: Vercel" e x-vercel-id mudou
   ```
   Reportar o que foi verificado e o que não foi.

## Migration de banco

```bash
# escrever o SQL primeiro
supabase/migrations/NNN_descricao.sql

# só com "sim":
/home/hermes/.hermes/profiles/lead4pro/bin/l4p-sql-write -f supabase/migrations/NNN_descricao.sql
/home/hermes/.hermes/profiles/lead4pro/bin/l4p-sql "select ..."   # conferir depois
```

## Migrations já aplicadas em produção (conferido 27/09/2026)

047 · 048 (atomic_buyer_settings) · 049 (priority_only) · 050 (trava de `is_admin`, testada:
PATCH como usuário → 42501) · 051 (noite 18h→7:59 na cópia SQL, testada: 03:00 EDT → true).
`049_lead_pricing_seed.sql` é opcional (sem linha = padrão de fábrica).

## Variável de ambiente nova

```bash
l4p-vercel env add NOME production
```

## Baseline conhecido (não confundir com regressão sua)

- `npm test` (`tsx --test tests/*.test.ts`, 208 testes em 27/09): **1 falha conhecida** —
  `automation-scheduling` ("lead distribution triggers automations…", regex de texto-fonte
  sem `as any`). Se só essa falhar, é baseline. Suítes `.cjs` rodam à parte:
  `node --test tests/<nome>.test.cjs` (`sales-team-pricing.test.cjs` tem 5 falhas de
  loader pré-existentes — `./i18n`).
- `npm run lint` na `main` intocada: ~898 erros (inútil como portão) — sempre lint só
  nos arquivos alterados.
- `.env.local` é git-ignored, nunca vai no commit.

## Interrupção no meio do trabalho

Se uma mensagem do Leandro interromper o turno, ao retomar cheque o que já foi feito
(`git log`, `l4p-sql`, `l4p-vercel env ls`) antes de continuar.
