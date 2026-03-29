# Access Control: Who can reach what

## OpenClaw instances — access model

Each instance has multiple access paths:

### 1. HTTPS API (via Caddy)
- **Who**: Anyone who knows the hostname AND gateway token
- **How**: `curl -H "Authorization: Bearer <gateway-token>" https://<hostname>/v1/chat/completions`
- **Auth**: Bearer token (gateway token from cloud-init)
- **Exposed endpoints**: `/v1/*` (chat API), `/health`, `/` (both return "ok")
- **Unexposed**: Everything else returns 404

**Security characteristics:**
- Hostname is `<12-char-hex>.agent.kodi.so` — the 12 chars are the first 12 of the gateway token
- This means knowing the hostname reveals 12/64 chars of the gateway token (not a practical attack vector — 52 remaining hex chars = 208 bits of entropy)
- No rate limiting on the Caddy layer — brute-force is theoretically possible but computationally infeasible
- No Cloudflare proxy protection (DNS-only for cert provisioning)

### 2. SSH
- **Who**: Anyone with the `ADMIN_SSH_PRIVATE_KEY`
- **How**: `ssh -i <key> ubuntu@<ip>` or `ssh -i <key> root@<ip>`
- **Auth**: SSH key pair (ed25519)
- **Port**: 22, open to 0.0.0.0/0 (all IPs)

**Security concerns:**
- Single key pair across ALL instances — compromise affects every instance
- SSH open to the internet (no IP restriction)
- Root access via SSH is enabled
- Key is stored in Railway env vars and local .env files

### 3. Direct IP access
- **Who**: Anyone who discovers the EC2 public IP
- **Ports open**: 22 (SSH), 80 (HTTP — redirects to HTTPS via Caddy), 443 (HTTPS)
- **Risk**: Port scan reveals an OpenClaw instance; hostname can be extracted from TLS cert SNI

## Railway services — access model

### API (`api.kodi.so`)
- **Public endpoints**: `/health` (unauthenticated)
- **tRPC endpoints**: Require session cookie (better-auth)
- **CORS**: Restricted to `APP_URL` and `WEB_URL` origins
- **Auth flow**: Cookie-based session → `isAuthed` middleware → `requireMember` (org membership) → `requireOwner` (owner role)

### LiteLLM (`ai.kodi.so`)
- **Public endpoints**: `/health/readiness` (unauthenticated — used by Railway health check)
- **All other endpoints**: Require `Authorization: Bearer <LITELLM_MASTER_KEY>`
- **Risk**: Master key grants full admin (create/delete customers, keys, view spend)

### App (`app.kodi.so`)
- **Public pages**: `/login`, `/signup`
- **Protected pages**: Everything else — server-side session check, redirects to login

## Who has access to what (people)

| Person/System | SSH to instances | Railway env vars | AWS console | Cloudflare DNS | LiteLLM admin |
|---------------|-----------------|------------------|-------------|----------------|---------------|
| You (Sebastian) | Yes (local key) | Yes (Railway dashboard) | Yes (IAM user) | Yes (API token) | Yes (master key) |
| Railway API service | Yes (env var key) | Own vars only | Yes (provisioning) | Yes (DNS records) | Yes (customer/key mgmt) |
| Claude Code (me) | Yes (via local key) | Read via MCP | Via local .env | Via local .env | Via local .env |
| OpenClaw instances | No (no key) | No | No | No | No (only virtual key) |

## Action items
- [ ] **HIGH**: Restrict SSH security group to known IPs (not 0.0.0.0/0)
- [ ] **HIGH**: Generate kodi-specific SSH key pair (stop reusing myopenclaw key)
- [ ] **MEDIUM**: Add Caddy rate limiting for /v1/* endpoints
- [ ] **MEDIUM**: Disable root SSH access (use ubuntu + sudo only)
- [ ] **LOW**: Per-instance SSH key pairs (generate during provisioning)
- [ ] **LOW**: Add IP allowlist for LiteLLM admin endpoints
