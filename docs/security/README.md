# Security Documentation

Security analysis and action items for the Kodi infrastructure.

## Documents

| Document | Description |
|----------|-------------|
| [SSL/TLS Architecture](ssl-tls.md) | How TLS works at each layer — Railway, Caddy, Let's Encrypt, cert renewals, MITM assessment |
| [Access Control](access-control.md) | Who can reach what — instance access model, SSH, Railway services, people/system access matrix |
| [Secrets & Encryption](secrets-encryption.md) | Encryption at rest, secrets inventory, key management, known crypto vulnerabilities |
| [Vulnerabilities](vulnerabilities.md) | Prioritized action items — critical, high, medium, low |

## Architecture overview

```
User Browser
    │ HTTPS (Railway TLS)
    ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ app.kodi.so │     │ api.kodi.so │     │  kodi.so    │
│  (Next.js)  │     │   (Hono)    │     │  (Next.js)  │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
              ┌────────────┼────────────┐
              │ HTTP       │ HTTPS      │ HTTP
              │ (internal) │ (public)   │ (internal)
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ LiteLLM  │ │ OpenClaw │ │ Postgres │
        │ai.kodi.so│ │ EC2      │ │ Railway  │
        └──────────┘ │ (Caddy)  │ └──────────┘
              │      └──────────┘
              │ HTTPS      │ HTTPS
              ▼            ▼
        ┌──────────┐ ┌──────────┐
        │ Moonshot │ │ LiteLLM  │
        │   API    │ │ai.kodi.so│
        └──────────┘ └──────────┘
```

## Last reviewed
2026-03-29
