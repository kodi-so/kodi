FROM oven/bun:1.1-alpine
WORKDIR /app

COPY . .
RUN bun install

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN cd apps/app && bun run build

EXPOSE 3001
CMD ["bun", "run", "--cwd", "apps/app", "start"]
