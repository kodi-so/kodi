# Kodi

A modern monorepo built with Turborepo, Bun, and deployed on Railway.

## Structure

apps/web       - Landing site (Next.js + Tailwind + ShadCN)
apps/app       - Web application (Next.js + Tailwind + ShadCN + BetterAuth + Stripe)
apps/api       - API server (Hono + tRPC)
packages/db    - Database (Postgres + Drizzle ORM)
packages/ui    - Shared UI components (ShadCN-style)
packages/typescript-config - Shared TypeScript configurations

## Getting Started

Prerequisites: Bun v1.1+, Node.js v18+, PostgreSQL

1. bun install
2. Copy .env.example files and fill in values
3. cd packages/db && bun run db:push
4. bun dev

## Apps

web: port 3000, app: port 3001, api: port 3002

## Deployment

Each app has a railway.toml. Deploy as separate Railway services.
