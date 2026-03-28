#!/usr/bin/env bash
# First-time deployment of the LiteLLM proxy to EC2.
# Refuses to run if an instance already exists — use update.sh or teardown.sh instead.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

# ─── Check that no instance exists ─────────────────────────────────
EXISTING_ID=$(find_running_instance)

if [ "$EXISTING_ID" != "None" ] && [ -n "$EXISTING_ID" ]; then
  echo "ERROR: Instance '$INSTANCE_NAME' already exists: $EXISTING_ID"
  echo ""
  echo "  To push config changes:  ./litellm/update.sh"
  echo "  To destroy and redeploy: ./litellm/teardown.sh && ./litellm/deploy.sh"
  exit 1
fi

# ─── Auto-generate master key if not set ────────────────────────────
if [ -z "${LITELLM_MASTER_KEY:-}" ]; then
  LITELLM_MASTER_KEY="sk-litellm-$(openssl rand -hex 24)"
  echo "Generated LITELLM_MASTER_KEY: $LITELLM_MASTER_KEY"
  echo ""
  echo "  IMPORTANT: Save this key. Add it to litellm/.env so update.sh can use it."
  echo ""
fi

echo "=== LiteLLM Proxy Deployment ==="
echo "Region:   $AWS_REGION"
echo "Instance: $INSTANCE_TYPE"
echo "Hostname: $PROXY_HOSTNAME"
echo "SSH key:  $SSH_KEY_PATH"
echo ""

# ─── Step 1: SSH key pair ──────────────────────────────────────────
echo "[1/8] Setting up SSH key pair..."
ensure_aws_key_pair

# ─── Step 2: Security Group ────────────────────────────────────────
echo "[2/8] Setting up security group..."
SG_ID=$(get_or_create_security_group)
echo "  Security group: $SG_ID"

# ─── Step 3: Find Ubuntu 24.04 AMI ─────────────────────────────────
echo "[3/8] Finding Ubuntu 24.04 AMI..."
AMI_ID=$(find_ubuntu_ami)
echo "  AMI: $AMI_ID"

# ─── Step 4: Launch EC2 ────────────────────────────────────────────
echo "[4/8] Launching EC2 instance..."
INSTANCE_ID=$(aws ec2 run-instances \
  --region "$AWS_REGION" \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$AWS_KEY_PAIR_NAME" \
  --security-group-ids "$SG_ID" \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=30,VolumeType=gp3}' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME}]" \
  --query 'Instances[0].InstanceId' \
  --output text)
echo "  Instance ID: $INSTANCE_ID"

echo "  Waiting for instance to be running..."
aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"

PUBLIC_IP=$(get_instance_ip "$INSTANCE_ID")
echo "  Public IP: $PUBLIC_IP"

# ─── Step 5: Create Cloudflare DNS record ───────────────────────────
echo "[5/8] Creating Cloudflare DNS record..."
create_dns_record "$PUBLIC_IP"

# ─── Step 6: Wait for SSH ───────────────────────────────────────────
echo "[6/8] Waiting for SSH..."
wait_for_ssh "$PUBLIC_IP"

# ─── Step 7: Upload files ──────────────────────────────────────────
echo "[7/8] Uploading configuration files..."
upload_files "$PUBLIC_IP"

# ─── Step 8: Run setup ─────────────────────────────────────────────
echo "[8/8] Running server setup (this takes ~2 minutes)..."
ssh $SSH_OPTS -i "$SSH_KEY_PATH" "ubuntu@${PUBLIC_IP}" \
  "sudo bash /tmp/litellm/setup-server.sh"

# ─── Done ───────────────────────────────────────────────────────────
echo ""
echo "============================================="
echo "  LiteLLM proxy deployed successfully!"
echo "============================================="
echo ""
echo "  Proxy URL:  https://${PROXY_HOSTNAME}"
echo "  Public IP:  ${PUBLIC_IP}"
echo "  Instance:   ${INSTANCE_ID}"
echo "  Master Key: ${LITELLM_MASTER_KEY}"
echo ""
echo "  Test it:"
echo "    curl https://${PROXY_HOSTNAME}/health"
echo ""
echo "  Add to your app .env:"
echo "    LITELLM_PROXY_URL=https://${PROXY_HOSTNAME}"
echo "    LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}"
echo ""
echo "  SSH:"
echo "    ssh -i ${SSH_KEY_PATH} ubuntu@${PUBLIC_IP}"
echo ""
