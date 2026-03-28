#!/usr/bin/env bash
# Destroys the LiteLLM proxy: terminates EC2 instance and removes DNS records.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# ─── Find existing instance ────────────────────────────────────────
INSTANCE_ID=$(find_running_instance)

if [ "$INSTANCE_ID" = "None" ] || [ -z "$INSTANCE_ID" ]; then
  echo "No running instance found with name '$INSTANCE_NAME'."
  echo "Cleaning up DNS records anyway..."
  delete_dns_records
  echo "Done."
  exit 0
fi

PUBLIC_IP=$(get_instance_ip "$INSTANCE_ID")

echo "=== Tearing Down LiteLLM Proxy ==="
echo "Instance: $INSTANCE_ID"
echo "IP:       $PUBLIC_IP"
echo ""
read -p "Are you sure? This will destroy the instance and all data. [y/N] " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# ─── Terminate EC2 ─────────────────────────────────────────────────
echo "[1/2] Terminating EC2 instance..."
aws ec2 terminate-instances \
  --region "$AWS_REGION" \
  --instance-ids "$INSTANCE_ID" > /dev/null
echo "  Instance $INSTANCE_ID terminating."

# ─── Delete DNS records ────────────────────────────────────────────
echo "[2/2] Removing DNS records..."
delete_dns_records

echo ""
echo "Teardown complete. Instance will finish terminating in ~1 minute."
echo "You can now run ./litellm/deploy.sh to create a fresh instance."
