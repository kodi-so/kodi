#!/usr/bin/env bash
# Shared config and helpers for deploy/update/teardown scripts.
#
# AWS credentials: uses your existing ~/.aws/credentials or
# AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars (same ones your app uses).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Load .env if present ───────────────────────────────────────────
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# ─── Configuration ──────────────────────────────────────────────────
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
INSTANCE_NAME="kodi-litellm-proxy"
PROXY_HOSTNAME="${PROXY_HOSTNAME:-ai.kodi.so}"
AWS_REGION="${AWS_REGION:-us-east-1}"
SG_NAME="kodi-litellm-sg"
AWS_KEY_PAIR_NAME="${AWS_KEY_PAIR_NAME:-kodi-litellm}"
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o LogLevel=ERROR"
SSH_KEY_PATH=$(eval echo "${SSH_KEY_PATH:-~/.ssh/id_ed25519}")

# ─── Validate required env vars ────────────────────────────────────
validate_env() {
  local missing=()
  [ -z "${MOONSHOT_API_KEY:-}" ]       && missing+=("MOONSHOT_API_KEY")
  [ -z "${AWS_ACCESS_KEY_ID:-}" ]      && missing+=("AWS_ACCESS_KEY_ID")
  [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]  && missing+=("AWS_SECRET_ACCESS_KEY")
  [ -z "${CLOUDFLARE_API_TOKEN:-}" ]   && missing+=("CLOUDFLARE_API_TOKEN")
  [ -z "${CLOUDFLARE_ZONE_ID:-}" ]     && missing+=("CLOUDFLARE_ZONE_ID")

  if [ ${#missing[@]} -gt 0 ]; then
    echo "ERROR: Missing required environment variables:"
    printf '  - %s\n' "${missing[@]}"
    echo ""
    echo "Copy litellm/env.example → litellm/.env and fill in the values."
    exit 1
  fi

  # Verify SSH key exists locally
  if [ ! -f "$SSH_KEY_PATH" ]; then
    echo "ERROR: SSH private key not found at: $SSH_KEY_PATH"
    echo "  Set SSH_KEY_PATH in litellm/.env to the path of your private key."
    echo "  e.g. SSH_KEY_PATH=~/.ssh/id_ed25519"
    exit 1
  fi

  # Export AWS creds so aws CLI picks them up from the .env
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_REGION
}

# ─── Helpers ────────────────────────────────────────────────────────

# Ensures the AWS key pair exists. If not, imports the local public key.
ensure_aws_key_pair() {
  local existing
  existing=$(aws ec2 describe-key-pairs \
    --region "$AWS_REGION" \
    --key-names "$AWS_KEY_PAIR_NAME" \
    --query 'KeyPairs[0].KeyName' \
    --output text 2>/dev/null || echo "None")

  if [ "$existing" = "None" ] || [ -z "$existing" ]; then
    # Derive public key path
    local pub_key_path="${SSH_KEY_PATH}.pub"
    if [ ! -f "$pub_key_path" ]; then
      echo "  Generating public key from private key..."
      ssh-keygen -y -f "$SSH_KEY_PATH" > "$pub_key_path"
    fi

    echo "  Importing SSH key to AWS as '${AWS_KEY_PAIR_NAME}'..."
    aws ec2 import-key-pair \
      --region "$AWS_REGION" \
      --key-name "$AWS_KEY_PAIR_NAME" \
      --public-key-material "fileb://${pub_key_path}" > /dev/null
    echo "  Key pair created."
  else
    echo "  Using existing AWS key pair: $AWS_KEY_PAIR_NAME"
  fi
}

find_running_instance() {
  aws ec2 describe-instances \
    --region "$AWS_REGION" \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=running,pending,stopped" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null || echo "None"
}

get_instance_ip() {
  aws ec2 describe-instances \
    --region "$AWS_REGION" \
    --instance-ids "$1" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text
}

get_or_create_security_group() {
  local sg_id
  sg_id=$(aws ec2 describe-security-groups \
    --region "$AWS_REGION" \
    --filters "Name=group-name,Values=$SG_NAME" \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "None")

  if [ "$sg_id" = "None" ] || [ -z "$sg_id" ]; then
    local vpc_id
    vpc_id=$(aws ec2 describe-vpcs \
      --region "$AWS_REGION" \
      --filters "Name=is-default,Values=true" \
      --query 'Vpcs[0].VpcId' \
      --output text)

    sg_id=$(aws ec2 create-security-group \
      --region "$AWS_REGION" \
      --group-name "$SG_NAME" \
      --description "Kodi LiteLLM proxy - SSH, HTTP, HTTPS" \
      --vpc-id "$vpc_id" \
      --query 'GroupId' \
      --output text)

    aws ec2 authorize-security-group-ingress --region "$AWS_REGION" --group-id "$sg_id" \
      --ip-permissions \
        IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges='[{CidrIp=0.0.0.0/0,Description=SSH}]' \
        IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges='[{CidrIp=0.0.0.0/0,Description=HTTP}]' \
        IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges='[{CidrIp=0.0.0.0/0,Description=HTTPS}]' \
      > /dev/null
  fi

  echo "$sg_id"
}

find_ubuntu_ami() {
  local ami_id
  ami_id=$(aws ssm get-parameters \
    --region "$AWS_REGION" \
    --names /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
    --query 'Parameters[0].Value' \
    --output text 2>/dev/null || echo "")

  if [ -z "$ami_id" ] || [ "$ami_id" = "None" ]; then
    ami_id=$(aws ec2 describe-images \
      --region "$AWS_REGION" \
      --owners 099720109477 \
      --filters "Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" \
      --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
      --output text)
  fi

  echo "$ami_id"
}

wait_for_ssh() {
  local ip="$1"
  for i in $(seq 1 30); do
    if ssh $SSH_OPTS -i "$SSH_KEY_PATH" "ubuntu@${ip}" "echo ok" 2>/dev/null; then
      echo "  SSH is ready."
      return 0
    fi
    if [ "$i" -eq 30 ]; then
      echo "  ERROR: SSH did not become available within 60s"
      exit 1
    fi
    sleep 2
  done
}

write_remote_env() {
  # Auto-generate DB password only on first deploy.
  # On updates, it MUST be set in litellm/.env to match the existing postgres volume.
  if [ -z "${LITELLM_DB_PASSWORD:-}" ]; then
    LITELLM_DB_PASSWORD="$(openssl rand -hex 16)"
    echo "  Generated LITELLM_DB_PASSWORD=${LITELLM_DB_PASSWORD}"
    echo "  IMPORTANT: Save this to litellm/.env for future updates."
  fi

  local env_file
  env_file=$(mktemp)
  cat > "$env_file" <<ENVEOF
MOONSHOT_API_KEY=${MOONSHOT_API_KEY}
LITELLM_MASTER_KEY=${LITELLM_MASTER_KEY}
LITELLM_DB_PASSWORD=${LITELLM_DB_PASSWORD}
PROXY_HOSTNAME=${PROXY_HOSTNAME}
STORE_MODEL_IN_DB=True
ENVEOF
  echo "$env_file"
}

upload_files() {
  local ip="$1"
  local env_file
  env_file=$(write_remote_env)

  ssh $SSH_OPTS -i "$SSH_KEY_PATH" "ubuntu@${ip}" "mkdir -p /tmp/litellm"
  scp $SSH_OPTS -i "$SSH_KEY_PATH" \
    "$SCRIPT_DIR/docker-compose.yml" \
    "$SCRIPT_DIR/litellm_config.yaml" \
    "$SCRIPT_DIR/Caddyfile" \
    "$SCRIPT_DIR/setup-server.sh" \
    "ubuntu@${ip}:/tmp/litellm/"
  scp $SSH_OPTS -i "$SSH_KEY_PATH" "$env_file" "ubuntu@${ip}:/tmp/litellm/.env"
  rm -f "$env_file"
}

create_dns_record() {
  local ip="$1"
  local result
  result=$(curl -sf -X POST \
    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{
      \"type\": \"A\",
      \"name\": \"${PROXY_HOSTNAME}\",
      \"content\": \"${ip}\",
      \"ttl\": 1,
      \"proxied\": false
    }")

  local success
  success=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success','false'))" 2>/dev/null || echo "false")
  if [ "$success" = "True" ] || [ "$success" = "true" ]; then
    local record_id
    record_id=$(echo "$result" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['id'])")
    echo "  DNS record created: $PROXY_HOSTNAME → $ip (ID: $record_id)"
  else
    echo "  WARNING: DNS creation failed (may already exist). $result"
  fi
}

delete_dns_records() {
  echo "  Finding DNS records for $PROXY_HOSTNAME..."
  local records
  records=$(curl -sf \
    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=${PROXY_HOSTNAME}&type=A" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    | python3 -c "import sys,json; [print(r['id']) for r in json.load(sys.stdin).get('result',[])]" 2>/dev/null || echo "")

  if [ -z "$records" ]; then
    echo "  No DNS records found."
    return
  fi

  while IFS= read -r record_id; do
    curl -sf -X DELETE \
      "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${record_id}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" > /dev/null
    echo "  Deleted DNS record: $record_id"
  done <<< "$records"
}

validate_env
