#!/usr/bin/env bash
set -euo pipefail

# Nginx Dashboard — one-shot installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/BetBoost/nginx-dashboard/main/install.sh | bash
#   ./install.sh

REPO_URL="${REPO_URL:-https://github.com/BetBoost/nginx-dashboard.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/nginx-dashboard}"
BRANCH="${BRANCH:-main}"

c_red()   { printf '\033[31m%s\033[0m\n' "$*"; }
c_green() { printf '\033[32m%s\033[0m\n' "$*"; }
c_blue()  { printf '\033[34m%s\033[0m\n' "$*"; }

need() { command -v "$1" >/dev/null 2>&1 || { c_red "missing: $1"; MISSING=1; }; }

c_blue "==> Checking prerequisites"
MISSING=0
need git
need openssl
if ! command -v docker >/dev/null 2>&1; then
  c_red "missing: docker"
  echo "    install it from https://docs.docker.com/engine/install/"
  MISSING=1
fi
if ! docker compose version >/dev/null 2>&1; then
  c_red "missing: docker compose plugin"
  MISSING=1
fi
[ "$MISSING" = 1 ] && exit 1
c_green "    all prerequisites present"

c_blue "==> Cloning repository"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "    $INSTALL_DIR already exists — pulling latest"
  git -C "$INSTALL_DIR" pull --ff-only
else
  git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

c_blue "==> Generating .env files"
gen_secret() { openssl rand -hex 32; }
gen_pw()     { openssl rand -base64 18 | tr -d '=+/' | cut -c1-20; }

write_env() {
  local src="$1" dst="$2"
  [ -f "$dst" ] && { echo "    keep existing $dst"; return; }
  cp "$src" "$dst"
  echo "    created $dst"
}

write_env .env.example .env
write_env backend/.env.example backend/.env
write_env frontend/.env.example frontend/.env

# fill secrets if placeholders look generic
fill() {
  local file="$1" key="$2" value="$3"
  if grep -qE "^${key}=" "$file"; then
    sed -i.bak -E "s|^${key}=.*|${key}=${value}|" "$file" && rm -f "${file}.bak"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

JWT_SECRET="$(gen_secret)"
REFRESH_SECRET="$(gen_secret)"
ENC_KEY="$(gen_secret)"
DB_PASS="$(gen_pw)"
ADMIN_PASS="$(gen_pw)"

fill backend/.env JWT_SECRET           "$JWT_SECRET"
fill backend/.env JWT_REFRESH_SECRET   "$REFRESH_SECRET"
fill backend/.env ENCRYPTION_KEY       "$ENC_KEY"
fill backend/.env DATABASE_PASSWORD    "$DB_PASS"
fill backend/.env ADMIN_PASSWORD       "$ADMIN_PASS"
fill .env         POSTGRES_PASSWORD    "$DB_PASS"

c_green "    secrets generated"

c_blue "==> Starting containers (docker compose up -d --build)"
docker compose up -d --build

c_green ""
c_green "==> Done!"
echo
echo "  Dashboard:  https://dashboard.localhost"
echo "  API docs:   https://api.localhost/docs"
echo "  Traefik:    https://traefik.localhost"
echo
echo "  Admin login (saved in backend/.env):"
grep -E '^ADMIN_(EMAIL|PASSWORD)=' backend/.env || true
echo
echo "  Logs:  docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
echo "  Stop:  docker compose -f $INSTALL_DIR/docker-compose.yml down"
