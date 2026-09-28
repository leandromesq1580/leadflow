#!/usr/bin/env bash
# Deploy de produção COM TRAVA (27/09/2026). Motivo: produção foi publicada de duas
# branches divergentes (main e fix/*) e cada deploy apagava o trabalho do outro lado.
# Regra: só publica se HEAD contém TUDO que está em origin/main; depois do deploy,
# main recebe fast-forward para ficar igual ao que está no ar.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git fetch -q origin
BEHIND=$(git rev-list --count HEAD..origin/main)
if [ "$BEHIND" -gt 0 ]; then
  echo "❌ origin/main tem $BEHIND commit(s) que este HEAD NÃO tem:"; git log --oneline HEAD..origin/main | sed 's/^/   /'
  echo "   Faça: git merge origin/main && (rode a suíte) && scripts/deploy-prod.sh"; exit 1
fi
if [ -n "$(git status --porcelain)" ]; then echo "❌ árvore suja — commite antes de publicar"; git status --short | head; exit 1; fi
echo "✅ HEAD $(git rev-parse --short HEAD) contém origin/main — publicando"
vercel link --yes --project leadflow >/dev/null
vercel deploy --prod --yes
git push origin HEAD:main
echo "✅ main ← fast-forward para $(git rev-parse --short HEAD)"
