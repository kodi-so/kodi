# ---- builder ----
FROM oven/bun:1.1-alpine AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN bun install

RUN mkdir -p apps/app/public && cd apps/app && bun run build

# Debug: show standalone contents
RUN echo "=== STANDALONE CONTENTS ===" && ls -la apps/app/.next/standalone/ && \
    echo "=== STANDALONE node_modules ===" && ls apps/app/.next/standalone/node_modules/ 2>/dev/null | head -10 || echo "no node_modules in standalone"

# ---- runner ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3001

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/public ./public

USER nextjs
EXPOSE 3001

CMD ["node", "server.js"]
