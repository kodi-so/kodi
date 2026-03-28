#!/usr/bin/env bash
# Push config/env changes to the existing LiteLLM proxy instance.
# Use after editing litellm_config.yaml, .env, Caddyfile, or docker-compose.yml.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# ─── Find existing instance ────────────────────────────────────────
INSTANCE_ID=$(find_running_instance)

if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "ERROR: No running instance found with name '$INSTANCE_NAME'."
  echo "  Run ./litellm/deploy.sh first."
  exit 1
fi

PUBLIC_IP=$(get_instance_ip "$INSTANCE_ID")
echo "=== Updating LiteLLM Proxy ==="
echo "Instance: $INSTANCE_ID"
echo "IP:       $PUBLIC_IP"
echo ""

# ─── Upload files ──────────────────────────────────────────────────
echo "[1/3] Uploading configuration files..."
upload_files "$PUBLIC_IP"
echo "  Done."

# ─── Copy to /opt and restart ──────────────────────────────────────
echo "[2/3] Applying changes..."
ssh $SSH_OPTS -i "$SSH_KEY_PATH" "ubuntu@${PUBLIC_IP}" bash <<'REMOTE'
  sudo cp /tmp/litellm/docker-compose.yml /opt/litellm/
  sudo cp /tmp/litellm/litellm_config.yaml /opt/litellm/
  sudo cp /tmp/litellm/.env /opt/litellm/
  sudo chmod 600 /opt/litellm/.env

  # Update Caddyfile (source from tmp copy since /opt is root-owned)
  source /tmp/litellm/.env
  sudo cp /tmp/litellm/Caddyfile /etc/caddy/Caddyfile
  sudo sed -i "s/{\$PROXY_HOSTNAME}/${PROXY_HOSTNAME}/" /etc/caddy/Caddyfile
REMOTE

echo "[3/3] Restarting services..."
ssh $SSH_OPTS -i "$SSH_KEY_PATH" "ubuntu@${PUBLIC_IP}" bash <<'REMOTE'
  cd /opt/litellm
  sudo docker compose pull
  sudo docker compose up -d
  sudo systemctl restart caddy
REMOTE

echo ""
echo "Update complete. Waiting for health check..."
sleep 3

if curl -sf "https://${PROXY_HOSTNAME}/health" > /dev/null 2>&1; then
  echo "  Proxy is healthy."
else
  echo "  WARNING: Health check failed. Check logs:"
  echo "    ssh -i ${SSH_KEY_PATH} ubuntu@${PUBLIC_IP}"
  echo "    cd /opt/litellm && sudo docker compose logs -f litellm"
fi
