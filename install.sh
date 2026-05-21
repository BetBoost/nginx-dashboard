#!/usr/bin/env bash
set -euo pipefail

# Nginx Dashboard — one-shot installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/BetBoost/nginx-dashboard/main/install.sh | bash
#   curl -fsSL .../install.sh | APP_DOMAIN=dashboard.example.com API_DOMAIN=api.example.com TRAEFIK_DOMAIN=traefik.example.com ACME_EMAIL=you@example.com bash
#   ./install.sh
#
# Env vars (optional — if unset and stdin is a TTY, you'll be prompted):
#   APP_DOMAIN       e.g. dashboard.example.com   (default: dashboard.localhost)
#   API_DOMAIN       e.g. api.example.com         (default: api.localhost)
#   TRAEFIK_DOMAIN   e.g. traefik.example.com     (default: traefik.localhost)
#   ACME_EMAIL       e.g. you@example.com         (default: admin@example.com — no real certs)
#   ADMIN_EMAIL      first admin's email          (default: admin@example.com)

REPO_URL="${REPO_URL:-https://github.com/BetBoost/nginx-dashboard.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/nginx-dashboard}"
BRANCH="${BRANCH:-main}"

c_red()   { printf '\033[31m%s\033[0m\n' "$*"; }
c_green() { printf '\033[32m%s\033[0m\n' "$*"; }
c_blue()  { printf '\033[34m%s\033[0m\n' "$*"; }
c_yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

need() { command -v "$1" >/dev/null 2>&1 || { c_red "missing: $1"; MISSING=1; }; }

ask() {
  # ask <var-name> <prompt> <default>
  local var="$1" prompt="$2" def="${3:-}"
  local cur="${!var:-}"
  if [ -n "$cur" ]; then return; fi
  if [ ! -t 0 ]; then
    eval "$var=\"\$def\""
    return
  fi
  local reply
  if [ -n "$def" ]; then
    read -r -p "$prompt [$def]: " reply </dev/tty || true
    reply="${reply:-$def}"
  else
    read -r -p "$prompt: " reply </dev/tty || true
  fi
  eval "$var=\"\$reply\""
}

c_blue "==> Checking prerequisites"
MISSING=0
need git
need openssl
if ! command -v docker >/dev/null 2>&1; then
  c_red "missing: docker"
  echo "    install: https://docs.docker.com/engine/install/"
  MISSING=1
fi
if ! docker compose version >/dev/null 2>&1; then
  c_red "missing: docker compose plugin"
  MISSING=1
fi
[ "$MISSING" = 1 ] && exit 1
c_green "    all prerequisites present"

c_blue "==> Configuration"
ask APP_DOMAIN     "Dashboard domain"        "dashboard.localhost"
ask API_DOMAIN     "API domain"              "api.localhost"
ask TRAEFIK_DOMAIN "Traefik dashboard domain" "traefik.localhost"
ask ACME_EMAIL     "Let's Encrypt email"     "admin@example.com"
ask ADMIN_EMAIL    "First admin email"       "admin@example.com"

echo "    APP_DOMAIN     = $APP_DOMAIN"
echo "    API_DOMAIN     = $API_DOMAIN"
echo "    TRAEFIK_DOMAIN = $TRAEFIK_DOMAIN"
echo "    ACME_EMAIL     = $ACME_EMAIL"
echo "    ADMIN_EMAIL    = $ADMIN_EMAIL"

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
gen_b64()    { openssl rand -base64 32 | tr -d '\n'; }
gen_pw()     { openssl rand -base64 18 | tr -d '=+/\n' | cut -c1-20; }

write_env() {
  local src="$1" dst="$2"
  if [ -f "$dst" ]; then
    echo "    keep existing $dst"
  else
    cp "$src" "$dst"
    echo "    created $dst"
  fi
}

write_env .env.example          .env
write_env backend/.env.example  backend/.env
write_env frontend/.env.example frontend/.env

fill() {
  local file="$1" key="$2" value="$3"
  # escape sed delimiter chars in value
  local v_escaped
  v_escaped=$(printf '%s' "$value" | sed -e 's/[\/&|]/\\&/g')
  if grep -qE "^${key}=" "$file"; then
    sed -i.bak -E "s|^${key}=.*|${key}=${v_escaped}|" "$file" && rm -f "${file}.bak"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

JWT_ACCESS_SECRET="$(gen_secret)"
JWT_REFRESH_SECRET="$(gen_secret)"
ENCRYPTION_KEY="$(gen_b64)"
DB_PASS="$(gen_pw)"
ADMIN_PASS="$(gen_pw)"

# root .env (compose / traefik)
fill .env APP_DOMAIN        "$APP_DOMAIN"
fill .env API_DOMAIN        "$API_DOMAIN"
fill .env TRAEFIK_DOMAIN    "$TRAEFIK_DOMAIN"
fill .env ACME_EMAIL        "$ACME_EMAIL"
fill .env POSTGRES_PASSWORD "$DB_PASS"

# backend/.env
fill backend/.env JWT_ACCESS_SECRET  "$JWT_ACCESS_SECRET"
fill backend/.env JWT_REFRESH_SECRET "$JWT_REFRESH_SECRET"
fill backend/.env ENCRYPTION_KEY     "$ENCRYPTION_KEY"
fill backend/.env ADMIN_EMAIL        "$ADMIN_EMAIL"
fill backend/.env ADMIN_PASSWORD     "$ADMIN_PASS"
fill backend/.env FRONTEND_URL       "https://$APP_DOMAIN"
fill backend/.env APP_URL            "https://$API_DOMAIN"

c_green "    secrets generated"

c_blue "==> Starting containers (docker compose up -d --build)"
docker compose up -d --build

c_green ""
c_green "==> Done!"
echo
echo "  Dashboard:  https://$APP_DOMAIN"
echo "  API docs:   https://$API_DOMAIN/docs"
echo "  Traefik:    https://$TRAEFIK_DOMAIN"
echo
echo "  Admin login (saved in backend/.env):"
echo "    email:    $ADMIN_EMAIL"
echo "    password: $ADMIN_PASS"
echo
if [[ "$APP_DOMAIN" != *.localhost ]]; then
  c_yellow "  Make sure your DNS A-records point these domains to this server:"
  echo "    $APP_DOMAIN"
  echo "    $API_DOMAIN"
  echo "    $TRAEFIK_DOMAIN"
  echo
  c_yellow "  Let's Encrypt issues certs on first request — first hit may take a few seconds."
fi
echo "  Logs:  docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
echo "  Stop:  docker compose -f $INSTALL_DIR/docker-compose.yml down"
