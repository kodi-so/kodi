# Secrets & Encryption

## Encryption at rest

### What's encrypted
| Data | Location | Encryption | Key |
|------|----------|-----------|-----|
| Gateway tokens | `instances.gateway_token` (Postgres) | AES-256-GCM | `ENCRYPTION_KEY` |
| LiteLLM virtual keys | `instances.litellm_virtual_key` (Postgres) | AES-256-GCM | `ENCRYPTION_KEY` |

### What's NOT encrypted
| Data | Location | Risk |
|------|----------|------|
| Chat messages | `chat_messages.content` (Postgres) | User conversations stored in plaintext |
| Hostnames | `instances.hostname` (Postgres) | Instance URLs visible in DB |
| IP addresses | `instances.ip_address` (Postgres) | Instance IPs visible in DB |
| EC2 instance IDs | `instances.ec2_instance_id` (Postgres) | AWS resource IDs visible |

### Encryption implementation
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **IV**: 12 bytes, randomly generated per encryption
- **Auth tag**: 16 bytes (prevents tampering)
- **Key**: 32 bytes from `ENCRYPTION_KEY` env var (64 hex chars)
- **Format**: base64(iv + authTag + ciphertext)
- **Location**: `packages/db/src/lib/crypto.ts`

### Key rotation
- **Not supported** — changing `ENCRYPTION_KEY` makes all existing encrypted values unreadable
- No key version prefix in the encrypted format
- To rotate: would need a migration that decrypts with old key and re-encrypts with new key

## Secrets inventory

### Railway env vars (both environments)

**API service:**
| Secret | Purpose | Blast radius if leaked |
|--------|---------|----------------------|
| `ENCRYPTION_KEY` | Encrypts/decrypts all DB secrets | All gateway tokens and LiteLLM keys exposed |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | EC2 provisioning | Can launch/terminate instances, read UserData |
| `ADMIN_SSH_PRIVATE_KEY` | SSH into all instances | Root access to every OpenClaw instance |
| `ADMIN_SSH_PUBLIC_KEY` | Injected into instances | Not secret (public key) |
| `BETTER_AUTH_SECRET` | Session token signing | Can forge any user session |
| `INVITE_JWT_SECRET` | Invite token signing | Can forge invite links |
| `CLOUDFLARE_API_TOKEN` | DNS management | Can create/delete DNS records for kodi.so |
| `RESEND_API_KEY` | Email sending | Can send emails as kodi.so |
| `LITELLM_MASTER_KEY` | LiteLLM admin | Full control of LiteLLM (keys, budgets, customers) |
| `DATABASE_URL` | Postgres connection | Full database access |

**LiteLLM service:**
| Secret | Purpose | Blast radius if leaked |
|--------|---------|----------------------|
| `LITELLM_MASTER_KEY` | Admin auth | Full LiteLLM admin |
| `MOONSHOT_API_KEY` | AI provider | Direct access to Moonshot API (costs money) |
| `DATABASE_URL` | Postgres (shared, litellm schema) | LiteLLM tables + potentially app tables |

### On EC2 instances (via cloud-init)
| Secret | Location on instance | Purpose |
|--------|---------------------|---------|
| Gateway token | `/root/.openclaw/openclaw.json` | Auth for gateway HTTP API |
| LiteLLM virtual key | `/root/.openclaw/openclaw.json` | Auth for LiteLLM proxy |
| SSH public key | `/root/.ssh/authorized_keys`, `/home/ubuntu/.ssh/authorized_keys` | SSH access |

## Known vulnerabilities

### Critical
1. **Chat router silent auth fallback** (`apps/api/src/routers/chat/router.ts:130-132`): If gateway token decryption fails, the request is sent WITHOUT authentication instead of failing. An attacker who corrupts the encrypted token in DB could cause the API to make unauthenticated requests to instances.

### High
2. **Shared SSH key**: One key pair for all instances. Leaked key = root on everything.
3. **No key rotation**: Changing `ENCRYPTION_KEY` is destructive (breaks all encrypted data).

### Medium
4. **Plaintext chat messages**: User conversations not encrypted at rest.
5. **Shared Postgres for LiteLLM**: Same credentials can access both app and LiteLLM schemas.
6. **EC2 UserData readable**: Anyone with `ec2:DescribeInstanceAttribute` can read provisioning secrets.

## Action items
- [ ] **HIGH**: Fix silent auth fallback — throw error if decryption fails
- [ ] **HIGH**: Generate kodi-specific SSH key pair
- [ ] **MEDIUM**: Add key version prefix for future rotation support
- [ ] **MEDIUM**: Evaluate encrypting chat messages at rest
- [ ] **LOW**: Separate Postgres credentials for LiteLLM
