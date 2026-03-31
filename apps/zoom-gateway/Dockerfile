FROM node:22-trixie-slim

WORKDIR /app

COPY package.json ./
COPY scripts ./scripts

RUN npm pkg delete devDependencies \
 && npm install --omit=dev

ENV NODE_ENV=production
ENV PORT=3010

COPY src ./src

EXPOSE 3010

CMD ["sh", "-c", "node scripts/prepare-rtms.mjs && node --import tsx src/index.ts"]
