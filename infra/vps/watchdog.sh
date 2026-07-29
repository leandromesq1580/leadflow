#!/bin/bash
# WA Bridge WATCHDOG (instalado 2026-07-24, autorizado pelo usuario).
# A cada 5min (systemd timer): bridge sem resposta OU sem ready e sem QR em 2
# checagens seguidas -> receita (kill main+chromes zumbis do perfil, limpa locks
# Singleton, reset-failed, start). Rate-limit 2 recuperacoes/bridge/hora.
# NUNCA toca em bridge ready:true ou com QR vivo. Log: /var/log/wa-bridge-watchdog.log
STATE=/var/lib/wa-bridge-watchdog
mkdir -p "$STATE"
LOG=/var/log/wa-bridge-watchdog.log
ts() { date '+%F %T'; }
for f in /etc/wa-bridge/*.env; do
  name=$(basename "$f" .env)
  PORT=$(grep -E '^PORT=' "$f" | cut -d= -f2 | tr -d '"')
  KEY=$(grep -E '^API_KEY=' "$f" | cut -d= -f2 | tr -d '"')
  [ -z "$PORT" ] && continue
  resp=$(curl -s -m 6 "http://localhost:$PORT/status" -H "apikey: $KEY" 2>/dev/null)
  if echo "$resp" | grep -qE '"ready":true|"hasQR":true'; then rm -f "$STATE/$name.bad"; continue; fi
  bad=$(cat "$STATE/$name.bad" 2>/dev/null || echo 0)
  bad=$((bad+1)); echo "$bad" > "$STATE/$name.bad"
  if [ "$bad" -lt 2 ]; then echo "$(ts) [$name] suspeita 1/2 ($resp)" >> "$LOG"; continue; fi
  hist="$STATE/$name.hist"; now=$(date +%s)
  recent=$(awk -v n="$now" '$1 > n-3600' "$hist" 2>/dev/null | wc -l)
  if [ "$recent" -ge 2 ]; then echo "$(ts) [$name] STUCK mas rate-limit ($recent/h) — deixando pro proximo ciclo" >> "$LOG"; continue; fi
  echo "$now" >> "$hist"; echo 0 > "$STATE/$name.bad"
  echo "$(ts) [$name] RECOVER (status: ${resp:-sem-resposta})" >> "$LOG"
  MAIN=$(systemctl show "wa-bridge@$name" -p MainPID --value)
  [ -n "$MAIN" ] && [ "$MAIN" != "0" ] && kill -9 "$MAIN" 2>/dev/null
  for p in $( (pgrep -f "chrome.*wa-bridge-data/$name"; pgrep -f "chrome.*session-$name") | sort -un ); do kill -9 "$p" 2>/dev/null; done
  systemctl stop "wa-bridge@$name" 2>/dev/null
  rm -f "/opt/wa-bridge-data/$name/session-$name/"Singleton* 2>/dev/null
  systemctl reset-failed "wa-bridge@$name" 2>/dev/null
  systemctl start "wa-bridge@$name"
  echo "$(ts) [$name] religada" >> "$LOG"
done
