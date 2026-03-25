FROM oven/bun:1.1-alpine
WORKDIR /app

COPY . .
RUN bun install

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# NEXT_PUBLIC_* vars must be present at build time (baked into the JS bundle).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN cd apps/app && bun run build

EXPOSE 3001

# next.config.mjs uses output: 'standalone', so we must use node server.js (not next start).
# Static assets and public dir need to be in place alongside the standalone bundle.
# Run DB migrations first — Railway does not reliably read per-service railway.toml in monorepos.
RUN cp -r /app/apps/app/.next/static /app/apps/app/.next/standalone/apps/app/.next/static 2>/dev/null || true \
 && cp -r /app/apps/app/public /app/apps/app/.next/standalone/apps/app/public 2>/dev/null || true
CMD ["sh", "-c", "cd /app/packages/db && bun run db:migrate && node /app/apps/app/.next/standalone/apps/app/server.js"]
