# ── builder ─────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --legacy-peer-deps
COPY . .
RUN npm run build

# ── runtime: nginx serves the static bundle ────────────────────────────────
FROM nginx:1.27-alpine AS runtime
RUN rm -rf /etc/nginx/conf.d/*
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ || exit 1
