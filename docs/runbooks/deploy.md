# Deploy — web/API (Vercel)

> Deploy em produção **sempre exige autorização explícita do Leandro** ("sim" no chat).
> Ler, editar código local, rodar lint/test/build são verdes; deploy é amarelo.

## Fluxo completo

1. `git pull --ff-only` na `main`; criar branch `fix/<assunto>` ou `feat/<assunto>`.
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
5. `git push -u origin <branch>`. Push direto na `main`: nunca.
6. Com o "sim" explícito do Leandro:
   ```bash
   cd ~/DEV-APPS/leadflow-agent
   /home/hermes/.hermes/profiles/lead4pro/bin/l4p-vercel deploy --prod --yes
   ```
   **Nunca** `~/.local/bin/vercel` direto — o scanner de segurança do Hermes bloqueia
   caminhos relativos e chamadas diretas.
7. Verificar:
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

## Variável de ambiente nova

```bash
l4p-vercel env add NOME production
```

## Baseline conhecido (não confundir com regressão sua)

- `npm test`: 2 falhas conhecidas em `automation-scheduling` e `lead-message-language`
  por incompatibilidade de API de mock timers Node 22 vs Node 20.9 local — se só essas
  2 falharem, é baseline, não sua mudança.
- `npm run lint` na `main` intocada: ~898 erros (inútil como portão) — sempre lint só
  nos arquivos alterados.
- `.env.local` é git-ignored, nunca vai no commit.

## Interrupção no meio do trabalho

Se uma mensagem do Leandro interromper o turno, ao retomar cheque o que já foi feito
(`git log`, `l4p-sql`, `l4p-vercel env ls`) antes de continuar.
