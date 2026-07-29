#!/bin/bash
set -e
BUYER_ID="$1"
PORT="$2"
NAME="$3"
if [ -z "$BUYER_ID" ] || [ -z "$PORT" ] || [ -z "$NAME" ]; then
  echo "uso: setup-bridge.sh <buyer_id> <port> <instance_name>"
  echo "ex:  setup-bridge.sh cabd03e1-... 3460 davi"
  exit 1
fi

SAFE_NAME=$(echo "$NAME" | tr -cd "[:alnum:]-_")
SESSION_DIR="/opt/wa-bridge-data/$SAFE_NAME"
ENV_FILE="/etc/wa-bridge/$SAFE_NAME.env"
API_KEY="l4p-$(head -c 12 /dev/urandom | base64 | tr -d /+=)"

mkdir -p "$SESSION_DIR"
chown -R root:root "$SESSION_DIR"

cat > "$ENV_FILE" << ENVEOF
PORT=$PORT
SESSION_DIR=$SESSION_DIR
INSTANCE_NAME=$SAFE_NAME
BRIDGE_OWNER_BUYER_ID=$BUYER_ID
API_KEY=$API_KEY
FORWARD_URL=https://lead4producers.com/api/webhook/wa-bridge
FORWARD_KEY=leadflow-bridge-2026
SUPABASE_URL=https://nkedavhzzddxuhpxcofd.supabase.co
SUPABASE_SERVICE_ROLE_KEY=__PREENCHER_SERVICE_ROLE_KEY__
ENVEOF
chmod 600 "$ENV_FILE"

systemctl daemon-reload
systemctl enable "wa-bridge@$SAFE_NAME.service"
systemctl restart "wa-bridge@$SAFE_NAME.service"

echo "--- Bridge criada ---"
echo "Buyer ID: $BUYER_ID"
echo "Instancia: $SAFE_NAME"
echo "Porta: $PORT"
echo "URL: http://62.146.229.13:$PORT"
echo "API Key: $API_KEY"
echo "SQL pra atualizar o buyer:"
echo "UPDATE buyers SET wa_bridge_url=http://62.146.229.13:$PORT, wa_bridge_key=$API_KEY, wa_bridge_status=pending_qr WHERE id=$BUYER_ID;"
