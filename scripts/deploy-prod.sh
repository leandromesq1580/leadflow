#!/usr/bin/env bash
# Deploy manual de produção COM TRAVA (27–28/09/2026).
# Motivo: produção foi publicada de duas branches divergentes (main e fix/*) e cada
# deploy apagava o trabalho do outro lado.
# Regra: só publica se HEAD é EXATAMENTE origin/main. A `main` é protegida no GitHub
# (PR obrigatório + check "Vercel"); push direto é rejeitado (GH013) — por isso este
# script NÃO faz mais push: mudança entra na `main` por PR (`gh pr create` + `gh pr merge`).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git fetch -q origin
BEHIND=$(git rev-list --count HEAD..origin/main)
AHEAD=$(git rev-list --count origin/main..HEAD)
if [ "$BEHIND" -gt 0 ]; then
  echo "❌ origin/main tem $BEHIND commit(s) que este HEAD NÃO tem:"; git log --oneline HEAD..origin/main | sed 's/^/   /'
  echo "   Faça: git checkout main && git pull --ff-only && scripts/deploy-prod.sh"; exit 1
fi
if [ "$AHEAD" -gt 0 ]; then
  echo "❌ este HEAD tem $AHEAD commit(s) que NÃO estão na origin/main:"; git log --oneline origin/main..HEAD | sed 's/^/   /'
  echo "   A main é protegida: abra PR (gh pr create --fill --base main), mescle (gh pr merge --squash --auto),"
  echo "   depois git checkout main && git pull --ff-only && scripts/deploy-prod.sh"; exit 1
fi
if [ -n "$(git status --porcelain)" ]; then echo "❌ árvore suja — commite antes de publicar"; git status --short | head; exit 1; fi
echo "✅ HEAD $(git rev-parse --short HEAD) == origin/main — publicando"
vercel link --yes --project leadflow >/dev/null
vercel deploy --prod --yes
echo "✅ produção = main@$(git rev-parse --short HEAD)"
