# Incidente 24–27/09/2026 — deploys de branches divergentes apagaram trabalho

## O que aconteceu
- 17–21/09: commits publicados a partir de `fix/settings-preserve-licenses` (preços em
  /admin/precos, leads frios com estoque/entrega, noite até 8 AM, wake do bridge) — sem
  passar pela `main`.
- 24/09 21:41–23:39 EDT: PRs #13/#14/#15 mesclados na `main` (priority_only, switch
  "Entregar somente aos prioritários", fuso da Flórida) e publicados — **sem** os commits
  da branch acima → preços/frios/noite saíram do ar por 3 dias.
- 27/09 18:10 EDT: deploy da branch `fix/…` (bridge reserva) **sem** mesclar a `main` →
  o switch dos prioritários e o fuso saíram do ar ("cadê o botão?").
- 27/09 22:46 EDT: merge dos dois lados (`e71a86a`, sem conflito de texto), `main` =
  branch, deploy verificado arquivo por arquivo.

## Conflito semântico que o merge não acusou
A 049 (`main`) copiou a disponibilidade para SQL (`automatic_buyer_available`) com a
noite **antiga** (18h–20h). Entregas pagas entre 21h e 7:59 eram recusadas no banco
enquanto o app dizia "na janela". Corrigido pela **051** (noite 18h→7:59, madrugada =
dia anterior) + teste `tests/priority-only-db.test.ts` carregando a 051.

## Regras que ficaram
- Produção = `main`. Antes de publicar: `git rev-list --count HEAD..origin/main` deve ser 0.
- `scripts/deploy-prod.sh` (fora do Hermes) recusa publicar se a `main` tiver commits que a
  cópia não tem, e faz fast-forward da `main` depois. No Hermes: `l4p-vercel deploy` só
  da cópia `~/DEV-APPS/leadflow-agent` em `main` atualizada.
- Quem copiar regra de negócio para SQL escreve teste de paridade SQL × TypeScript.
