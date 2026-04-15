# Kodi

A platform for teams that want an AI agent in the room. Kodi joins calls, keeps shared context across tools, answers questions with business data, and turns decisions into tracked follow-through work.

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

| App            | Port | Description       |
| -------------- | ---- | ----------------- |
| `web`          | 3000 | Landing site      |
| `app`          | 3001 | Web application   |
| `api`          | 3002 | API server        |

## Deployment (Railway)

Each app has a `railway.toml`. Deploy each as a separate Railway service pointing to the relevant `apps/*` directory, and set the environment variables in the Railway dashboard.

## PR Safety

Never continue work on a branch whose GitHub PR is already merged or closed. That creates confusing history and makes it easy to accidentally push follow-up work into an already-finished PR thread.

Before opening or updating a PR, run:

```bash
bun run pr:check
```

This command uses the GitHub CLI, so it expects `gh auth status` to be healthy and the network to be available.

This will:

- fail if the current branch is `dev`, `main`, or `master`
- fail if the current branch already has a merged or closed PR
- pass if the branch has no PR yet or still has an open PR

If it fails because the branch was already merged, create a fresh branch from `dev`:

```bash
git switch dev
git pull
git switch -c my-new-branch
```
