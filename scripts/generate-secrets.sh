#!/usr/bin/env bash
# Generate strong secrets for backend/.env.
# Usage: ./scripts/generate-secrets.sh > backend/.env
set -euo pipefail

ENC=$(openssl rand -base64 32)
JWT_A=$(openssl rand -hex 32)
JWT_R=$(openssl rand -hex 32)
ADMIN_PW=$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)

cat <<EOF
NODE_ENV=production
PORT=4000
APP_URL=https://api.localhost
FRONTEND_URL=https://dashboard.localhost

DATABASE_URL=postgresql://nginx_dashboard:CHANGE_ME@postgres:5432/nginx_dashboard?schema=public

ENCRYPTION_KEY=${ENC}
JWT_ACCESS_SECRET=${JWT_A}
JWT_REFRESH_SECRET=${JWT_R}
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=${ADMIN_PW}

THROTTLE_TTL=60
THROTTLE_LIMIT=100

CORS_ORIGINS=https://dashboard.localhost
EOF

echo "" >&2
echo "✔  bootstrap admin password (write this down): ${ADMIN_PW}" >&2
