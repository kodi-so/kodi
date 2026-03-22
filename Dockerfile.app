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

RUN cd apps/app && bun run build

# ---- runner ----
# Note: Next.js standalone output for monorepos puts server.js at apps/app/server.js
# and bundles node_modules at the root of the standalone directory.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3001

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy the full standalone output (includes bundled node_modules + server.js)
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/standalone ./
# Copy static assets to where the standalone server expects them
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/static ./apps/app/.next/static

USER nextjs
EXPOSE 3001

# server.js is at apps/app/server.js inside the standalone output
CMD ["node", "apps/app/server.js"]
