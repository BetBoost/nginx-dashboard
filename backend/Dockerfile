# ── builder ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# install OS deps for native modules (argon2, ssh2)
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate \
 && npm run build

# ── runtime ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -m -u 10001 app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

USER app
EXPOSE 4000

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
