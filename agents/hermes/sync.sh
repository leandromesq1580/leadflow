#!/usr/bin/env bash
# Sincroniza o agente Hermes "lead4pro" com a main do repositório — roda a cada 10 min no
# servidor do Hermes (timer systemd --user lead4pro-sync.timer). Fonte da verdade:
#   agents/hermes/lead4pro/SOUL.md  → ~/.hermes/profiles/lead4pro/SOUL.md
#   agents/hermes/lead4pro/SKILL.md → ~/.hermes/skills/devops/lead4pro/SKILL.md
# e a cópia de trabalho ~/DEV-APPS/leadflow-agent fica SEMPRE na main atualizada.
# Edite o SOUL/SKILL no repositório (PR na main), nunca direto no servidor: o sync sobrescreve.
set -uo pipefail
CLONE="${LEAD4PRO_CLONE:-$HOME/DEV-APPS/leadflow-agent}"
PROFILE="$HOME/.hermes/profiles/lead4pro"
SKILLDIR="$HOME/.hermes/skills/devops/lead4pro"
ts() { date '+%F %T'; }
cd "$CLONE" || { echo "$(ts) ❌ clone não existe: $CLONE"; exit 1; }
git fetch -q origin || { echo "$(ts) ❌ git fetch falhou"; exit 1; }
BR=$(git branch --show-current)
if [ "$BR" != "main" ]; then
  if [ -z "$(git status --porcelain)" ]; then git checkout -q main && echo "$(ts) ↪ voltou para main (estava em $BR)"
  else echo "$(ts) ⚠️ clone em '$BR' com alterações não commitadas — não troco de branch; SOUL/SKILL sincronizados pela origin/main"; fi
fi
BEFORE=$(git rev-parse HEAD)
if [ "$(git branch --show-current)" = "main" ]; then
  if [ -z "$(git status --porcelain)" ]; then
    git merge -q --ff-only origin/main 2>/dev/null || echo "$(ts) ⚠️ main local não avança por fast-forward"
  else echo "$(ts) ⚠️ main com alterações locais — não puxei"; fi
fi
AFTER=$(git rev-parse HEAD)
[ "$BEFORE" != "$AFTER" ] && echo "$(ts) ✅ clone: $(git log -1 --format='%h %s' | cut -c1-80)"
if [ "$BEFORE" != "$AFTER" ] && ! git diff --quiet "$BEFORE" "$AFTER" -- package-lock.json; then
  echo "$(ts) 📦 package-lock mudou → npm ci"; npm ci --no-audit --no-fund >/dev/null 2>&1 && echo "$(ts) 📦 npm ci ok" || echo "$(ts) ❌ npm ci falhou"
fi
# SOUL/SKILL: sempre da origin/main (mesmo que o clone esteja preso numa branch)
sync_file() { # <caminho no repo> <destino>
  local src="$1" dst="$2" tmp; tmp=$(mktemp)
  git show "origin/main:$src" > "$tmp" 2>/dev/null || { echo "$(ts) ⚠️ $src não existe na origin/main"; rm -f "$tmp"; return; }
  if ! cmp -s "$tmp" "$dst"; then
    mkdir -p "$(dirname "$dst")"; [ -f "$dst" ] && cp "$dst" "$dst.bak-$(date +%Y%m%d-%H%M%S)"
    cp "$tmp" "$dst" && echo "$(ts) ✅ $(basename "$dst") atualizado ($(wc -l < "$dst") linhas, origin/main $(git rev-parse --short origin/main))"
    ls -t "$dst".bak-* 2>/dev/null | tail -n +6 | xargs -r rm -f   # guarda 5 backups
  fi
  rm -f "$tmp"
}
sync_file agents/hermes/lead4pro/SOUL.md  "$PROFILE/SOUL.md"
sync_file agents/hermes/lead4pro/SKILL.md "$SKILLDIR/SKILL.md"
echo "$(ts) ok · clone $(git rev-parse --short HEAD) ($(git branch --show-current)) · origin/main $(git rev-parse --short origin/main) · atrás: $(git rev-list --count HEAD..origin/main)"
