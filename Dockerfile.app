# ---- builder ----
FROM oven/bun:1.1-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN bun install --frozen-lockfile 2>/dev/null || bun install
RUN mkdir -p apps/app/public && cd apps/app && bun run build

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy standalone into apps/app to preserve relative node_modules paths
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/standalone/apps/app ./apps/app
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/standalone/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/public ./apps/app/public

USER nextjs
EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/app/server.js"]
