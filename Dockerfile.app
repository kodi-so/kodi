# ---- deps ----
FROM oven/bun:1.1-alpine AS deps
WORKDIR /app

COPY package.json ./
COPY apps/app/package.json ./apps/app/
COPY packages/ui/package.json ./packages/ui/
COPY packages/db/package.json ./packages/db/
COPY packages/typescript-config/package.json ./packages/typescript-config/

RUN bun install

# ---- builder ----
FROM oven/bun:1.1-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build from repo root so Next.js standalone output uses monorepo-relative paths
RUN cd apps/app && bun run build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3001

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Standalone output from monorepo build is at apps/app/.next/standalone
# It contains server.js at the root (not nested under apps/app)
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/standalone ./
# Static assets
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/static ./.next/static

USER nextjs
EXPOSE 3001

CMD ["node", "server.js"]
