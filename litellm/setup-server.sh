#!/usr/bin/env bash
# Runs on the remote EC2 instance to install and start all services.
set -euo pipefail

echo "=== [1/5] Installing Docker ==="
apt-get update -y
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

echo "=== [2/5] Installing Caddy ==="
apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy

echo "=== [3/5] Configuring firewall ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable

echo "=== [4/5] Starting LiteLLM ==="
mkdir -p /opt/litellm
cp /tmp/litellm/docker-compose.yml /opt/litellm/
cp /tmp/litellm/litellm_config.yaml /opt/litellm/
cp /tmp/litellm/.env /opt/litellm/
chmod 600 /opt/litellm/.env

cd /opt/litellm
docker compose up -d

source /opt/litellm/.env

echo "Waiting for LiteLLM to start (Postgres must be healthy first)..."
for i in $(seq 1 60); do
  if curl -sf -H "Authorization: Bearer ${LITELLM_MASTER_KEY}" http://localhost:4000/health > /dev/null 2>&1; then
    echo "LiteLLM is healthy!"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "WARNING: LiteLLM did not become healthy within 120s"
    docker compose logs --tail 50
    exit 1
  fi
  sleep 2
done

echo "=== [5/5] Starting Caddy ==="
cp /tmp/litellm/Caddyfile /etc/caddy/Caddyfile

# Expand PROXY_HOSTNAME env var in the Caddyfile
source /opt/litellm/.env
sed -i "s/{\\\$PROXY_HOSTNAME}/${PROXY_HOSTNAME}/" /etc/caddy/Caddyfile

systemctl restart caddy
systemctl enable caddy

echo "=== Setup complete ==="
