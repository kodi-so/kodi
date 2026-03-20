# Kodi

A modern monorepo built with Turborepo, Bun, and deployed on Railway.

## Structure

```
kodi/
├── apps/
│   ├── web/       # Landing site (Next.js + Tailwind + ShadCN)
│   ├── app/       # Web application (Next.js + Tailwind + ShadCN + BetterAuth + Stripe)
│   └── api/       # API server (Hono + tRPC)
├── packages/
│   ├── db/        # Database (Postgres + Drizzle ORM)
│   ├── ui/        # Shared UI components (ShadCN-style)
│   └── typescript-config/ # Shared TypeScript configs
```

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.1+
- PostgreSQL database (local or hosted)

### Setup

1. **Install dependencies**
   ```bash
   bun install
   ```

2. **Set up environment variables** — copy and fill in each:
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   cp apps/app/.env.example apps/app/.env.local
   cp apps/api/.env.example apps/api/.env
   cp packages/db/.env.example packages/db/.env
   ```

3. **Run database migrations** (requires `DATABASE_URL` to be set in `packages/db/.env`):
   ```bash
   cd packages/db && bun run db:push
   ```

4. **Start development servers**
   ```bash
   cd ../.. && bun dev
   ```

### Apps & Ports

| App | Port | Description |
|-----|------|-------------|
| `web` | 3000 | Landing site |
| `app` | 3001 | Web application |
| `api` | 3002 | API server |

## Deployment (Railway)

Each app has a `railway.toml`. Deploy each as a separate Railway service pointing to the relevant `apps/*` directory, and set the environment variables in the Railway dashboard.
