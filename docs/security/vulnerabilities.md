# Vulnerabilities & Action Items

Prioritized list of security issues to address. Check items off as they're resolved.

## Critical (fix before production users)

- [ ] **Silent auth fallback in chat router**
  - File: `apps/api/src/routers/chat/router.ts:130-132`
  - Issue: If gateway token decryption fails, request sent without auth instead of failing
  - Fix: Replace catch block with a thrown error

- [ ] **SSH open to the world (0.0.0.0/0)**
  - Resource: Security group `sg-035c523eb7aedf94a` (`myopenclaw-instances`)
  - Issue: Port 22 accepts connections from any IP
  - Fix: Restrict to known IPs, or use AWS Session Manager instead of direct SSH

## High (fix before scaling)

- [ ] **Shared SSH key pair across all instances**
  - Issue: One `ADMIN_SSH_PRIVATE_KEY` for every instance — single point of compromise
  - Fix: Generate per-instance key pairs during provisioning, or create kodi-specific keys at minimum

- [ ] **Reusing myopenclaw AWS resources**
  - Issue: Using `myopenclaw-provisioner` IAM user and `myopenclaw-instances` security group
  - Fix: Create kodi-specific IAM user with minimal permissions and dedicated security group

- [ ] **No CSRF protection on tRPC mutations**
  - Issue: `credentials: true` CORS with cookie auth but no CSRF token
  - Fix: Add CSRF token middleware or use SameSite=Strict cookies

- [ ] **LiteLLM shares app Postgres**
  - Issue: Same `DATABASE_URL` credentials — LiteLLM schema can access public schema tables
  - Fix: Create separate Postgres user for LiteLLM with schema-restricted permissions

## Medium (security hardening)

- [ ] **No rate limiting on OpenClaw instance endpoints**
  - Issue: Caddy has no rate limiting on `/v1/*` — brute-force theoretically possible
  - Fix: Add Caddy rate limiting directives to cloud-init Caddyfile

- [ ] **No rate limiting on Railway API**
  - Issue: tRPC endpoints have no rate limiting
  - Fix: Add rate limiting middleware (per-IP or per-user)

- [ ] **Chat messages stored in plaintext**
  - Issue: `chat_messages.content` not encrypted
  - Fix: Encrypt message content with org-specific key or `ENCRYPTION_KEY`

- [ ] **Root SSH access enabled**
  - Issue: SSH public key added to both `ubuntu` and `root` authorized_keys
  - Fix: Only allow `ubuntu` user, require `sudo` for root operations

- [ ] **No encryption key rotation support**
  - Issue: Changing `ENCRYPTION_KEY` breaks all encrypted values
  - Fix: Add key version prefix to encrypted format, support multi-key decryption

- [ ] **AWS IAM over-permissioned**
  - Issue: `myopenclaw-provisioner` may have more permissions than needed
  - Fix: Create kodi-specific IAM user with only: RunInstances, TerminateInstances, DescribeInstances

## Low (future hardening)

- [ ] **No audit logging for provisioning actions**
  - Issue: No record of who provisioned/deprovisioned what and when (beyond activity log)
  - Fix: Add structured audit events for all provisioning actions

- [ ] **Instance hostnames partially reveal gateway token**
  - Issue: Hostname uses first 12 chars of gateway token (not a practical attack — 52 remaining chars)
  - Fix: Use a separate random ID for hostnames instead of token prefix

- [ ] **No network segmentation for instances**
  - Issue: All instances share the same security group and subnet
  - Fix: Per-org or per-instance security groups for isolation

- [ ] **DNSSEC not enabled**
  - Issue: DNS poisoning could redirect instance traffic
  - Fix: Enable DNSSEC for kodi.so zone in Cloudflare

- [ ] **No monitoring/alerting for security events**
  - Issue: No alerts for failed SSH attempts, unusual API patterns, or instance compromises
  - Fix: CloudWatch alerts, fail2ban on instances, or a monitoring service
