# Railway Deployment Guide

This monorepo deploys 4 services on Railway: `api`, `web`, `app`, and `postgres`.

---

## Architecture

| Service    | Dockerfile       | Port | Description                   |
|------------|-----------------|------|-------------------------------|
| `api`      | Dockerfile.api  | 3002 | Hono/tRPC API (Bun runtime)   |
| `web`      | Dockerfile.web  | 3000 | Marketing/public Next.js site |
| `app`      | Dockerfile.app  | 3001 | Main app (Next.js + tRPC)     |
| `postgres` | Railway plugin  | 5432 | Managed Postgres 16           |

---

## First-Time Setup

### 1. Create a Railway project

Go to [railway.app](https://railway.app) → New Project → Empty Project.

### 2. Add Postgres

Click **+ New** → **Database** → **PostgreSQL**. Railway will provision it and expose `DATABASE_URL`.

### 3. Add each service

For **each** of `api`, `web`, `app`:

1. Click **+ New** → **GitHub Repo** → select `kodi-so/kodi`
2. In the service settings:
   - **Build** → Dockerfile path → set to the relevant file (e.g. `Dockerfile.api`)
   - **Deploy** → Set the environment variables (see below)

---

## Environment Variables

### `api` service
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
PORT=3002
WEB_URL=https://<your-web-domain>.railway.app
APP_URL=https://<your-app-domain>.railway.app
```

### `web` service
```
PORT=3000
NEXT_PUBLIC_API_URL=https://<your-api-domain>.railway.app
```

### `app` service
```
PORT=3001
NEXT_PUBLIC_API_URL=https://<your-api-domain>.railway.app
DATABASE_URL=${{Postgres.DATABASE_URL}}
BETTER_AUTH_SECRET=<generate-a-random-secret>
BETTER_AUTH_URL=https://<your-app-domain>.railway.app
AUTH_COOKIE_DOMAIN=<your-root-domain>
STRIPE_SECRET_KEY=<your-stripe-key>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<your-stripe-pub-key>
```

> Use Railway's `${{ServiceName.VARIABLE}}` reference syntax to share variables between services.

---

## Environments

Railway supports multiple environments out of the box.

### Production (`main` branch)
- Auto-deploys on push to `main`
- Set in each service: **Source** → Branch → `main`

### Development (`dev` branch)
1. In Railway dashboard → click the environment name → **New Environment** → name it `development`
2. Each service in the `development` environment can point to the `dev` branch
3. Gives you a separate Postgres instance, separate domains, full isolation

### Feature Branches (PR previews)
1. In each service settings → **Deployments** → enable **PR Previews**
2. Railway will spin up ephemeral environments for every PR automatically
3. They're torn down when the PR closes

---

## Running DB Migrations

The `api` container is configured to run `cd /app/packages/db && bun run db:migrate`
automatically on startup before serving traffic.

If a deployment misses a migration for any reason, the API now fails its startup
schema readiness check loudly instead of serving partially migrated meeting
voice features.

Manual migration commands remain useful as a fallback or when debugging an
existing environment:

```bash
# In Railway dashboard → api service → Shell tab
cd packages/db && bun run db:migrate
```

Or use the Railway CLI:
```bash
railway run --service api bun run db:migrate
```

---

## Custom Domains

In each service → **Settings** → **Domains** → add your custom domain and configure DNS as shown.
