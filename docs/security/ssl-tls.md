# SSL/TLS Architecture

## How TLS works at each layer

### Railway services (app, api, web, litellm)

Railway automatically provisions and renews TLS certificates for all public domains.

| Service | Domain | TLS Provider | Renewal |
|---------|--------|-------------|---------|
| app | app.kodi.so | Railway (automatic) | Automatic, no action needed |
| api | api.kodi.so | Railway (automatic) | Automatic |
| web | kodi.so | Railway (automatic) | Automatic |
| litellm | ai.kodi.so | Railway (automatic) | Automatic |

- Railway uses its own certificate authority or Let's Encrypt under the hood
- You never touch certs — Railway handles provisioning, renewal, and termination
- TLS terminates at Railway's edge; traffic inside Railway's private network is unencrypted HTTP (this is standard and acceptable — the private network is isolated)

### OpenClaw EC2 instances

Each provisioned instance gets its own subdomain (e.g., `9e0732daa70f.agent.kodi.so`) with TLS handled by **Caddy**.

**How it works:**
1. During provisioning, a Cloudflare DNS A record is created: `<hash>.agent.kodi.so → <EC2 public IP>`
2. The record is set to `proxied: false` (DNS-only, grey cloud) — this is critical
3. Caddy is installed on the EC2 instance with a Caddyfile pointing to the hostname
4. On first request, Caddy automatically obtains a Let's Encrypt certificate via **ACME HTTP-01 challenge**
5. Caddy stores certs in its data directory and auto-renews 30 days before expiry

**Why DNS-only (not Cloudflare proxy)?**
- ACME HTTP-01 requires Let's Encrypt to reach the EC2 instance directly on port 80
- If Cloudflare proxy is enabled, Cloudflare intercepts the ACME challenge and it fails
- This also means Cloudflare's WAF/DDoS protection does NOT cover instance endpoints

**Certificate renewal:**
- Caddy handles renewal automatically as long as the instance is running
- If an instance is stopped for >60 days, the cert expires and Caddy re-provisions on restart
- No manual intervention needed

### Internal traffic (no TLS)

| Route | Protocol | Why no TLS |
|-------|----------|------------|
| API → LiteLLM (`litellm.railway.internal:4000`) | HTTP | Railway private network — isolated, no external access |
| OpenClaw gateway (`localhost:18789`) ← Caddy | HTTP | Loopback only — never leaves the machine |

## MITM vulnerability assessment

### Protected against MITM:
- All public-facing endpoints use HTTPS with valid certificates
- Browser connections to app/api are TLS-encrypted
- API → OpenClaw instances use HTTPS (Caddy certs)
- OpenClaw → LiteLLM uses HTTPS (`ai.kodi.so`)

### Potential MITM vectors:
1. **DNS poisoning**: If an attacker compromises Cloudflare DNS or intercepts DNS resolution, they could redirect `*.agent.kodi.so` to a malicious server. Mitigation: Cloudflare DNS is generally trustworthy; consider DNSSEC.
2. **Railway internal network**: Traffic between API and LiteLLM is unencrypted HTTP over Railway's private network. Railway isolates this, but a compromised Railway service in the same project could sniff traffic. Risk: very low.
3. **EC2 instance UserData**: During provisioning, secrets (gateway token, LiteLLM key) are passed via EC2 UserData (base64, not encrypted). AWS encrypts this in transit via their API, but anyone with `ec2:DescribeInstanceAttribute` IAM permission can read it. Risk: low (requires AWS access).

## Action items
- [ ] Consider enabling DNSSEC for kodi.so zone in Cloudflare
- [ ] Consider Cloudflare WAF rules for `*.agent.kodi.so` (requires Enterprise or specific setup)
- [ ] Monitor cert expiry via Caddy logs if instances run long-term
