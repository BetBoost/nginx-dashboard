# Nginx Dashboard

A modern fullstack web application to centrally manage **Nginx subdomains across multiple Linux servers** — without ever touching a shell. Inspired by panels like Plesk, Coolify and Portainer.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Stack](https://img.shields.io/badge/stack-React%20%7C%20NestJS%20%7C%20Postgres-purple)

## Features

- **Server management** — register multiple servers, store encrypted SSH keys, test connectivity
- **Subdomain CRUD** — generate nginx vhost files, symlink `sites-enabled`, reload nginx automatically
- **SSL automation** — request and renew Let's Encrypt certificates via certbot
- **Monitoring** — live nginx process status, SSL expiry, HTTP reachability checks
- **Audit log** — every privileged action is recorded with actor, target and diff
- **Backup / Restore** — snapshot all nginx configs of a server and restore them later
- **Auth** — JWT auth + refresh tokens, role-based access (`ADMIN`, `USER`)
- **Modern UI** — React + TypeScript + TailwindCSS, dark mode, responsive
- **Production ready** — Dockerized, Traefik reverse proxy, CI/CD via GitHub Actions, Swagger docs

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                      Browser (HTTPS)                          │
└──────────────────────────┬────────────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │     Traefik      │   ← reverse proxy + ACME
                  └────────┬────────┘
              ┌────────────┼─────────────┐
        ┌─────▼─────┐ ┌────▼─────┐ ┌─────▼─────┐
        │  Frontend │ │ Backend  │ │  Swagger  │
        │ (Nginx +  │ │ (NestJS) │ │   /docs   │
        │   React)  │ │          │ │           │
        └───────────┘ └────┬─────┘ └───────────┘
                           │  Prisma
                      ┌────▼─────┐         ┌──────────────┐
                      │ Postgres │         │ Remote Linux │
                      └──────────┘         │   Servers    │
                                           │ (via SSH2)   │
                                           └──────────────┘
```

## Quickstart

**One-liner (generates secrets + starts containers):**

```bash
curl -fsSL https://raw.githubusercontent.com/BetBoost/nginx-dashboard/main/install.sh | bash
```

**Manual:**

```bash
git clone https://github.com/BetBoost/nginx-dashboard.git
cd nginx-dashboard

# 1. configure
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. start everything
docker compose up -d --build

# 3. open
#    Dashboard:  https://dashboard.localhost
#    API docs:   https://api.localhost/docs
#    Traefik:    https://traefik.localhost
```

The first admin user is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend/.env` on first boot.

## Project layout

```
nginx-dashboard/
├── backend/             # NestJS API
│   ├── src/
│   │   ├── modules/     # auth, users, servers, subdomains, ssh, nginx, ssl, …
│   │   ├── common/      # guards, filters, interceptors, decorators
│   │   └── config/
│   └── prisma/          # schema.prisma + migrations
├── frontend/            # React + Vite + TailwindCSS
│   └── src/
│       ├── pages/
│       ├── components/
│       └── api/
├── traefik/             # Traefik static + dynamic config
├── docker/              # Dockerfiles
├── scripts/             # Helper scripts (seed admin, backup db…)
└── docker-compose.yml
```

## Development

```bash
# Backend
cd backend
npm install
npm run prisma:migrate
npm run start:dev          # http://localhost:4000

# Frontend
cd frontend
npm install
npm run dev                # http://localhost:5173
```

## How a subdomain is created (high level)

```
User submits form  ──►  POST /api/subdomains
                          │
                          ▼
                  validates DTO + role
                          │
                          ▼
           NginxTemplateService.render({ ... })
                          │
                          ▼
            SshService.exec(server, [
              `tee /etc/nginx/sites-available/<name>.conf`,
              `ln -sf … /etc/nginx/sites-enabled/<name>.conf`,
              `nginx -t && systemctl reload nginx`
            ])
                          │
                          ▼
         (optional) certbot --nginx -d <name> --redirect
                          │
                          ▼
          Subdomain row persisted + AuditLog written
```

## Security

- SSH connections require key auth — passwords are refused
- Private keys are encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`)
- JWT secrets, DB credentials and the encryption key are provided through `.env`
- HTTP rate limiting via `@nestjs/throttler`
- Helmet, CORS allow-list, CSRF token cookie for state-changing requests
- Every privileged call (create / delete / reload) is appended to the `AuditLog`

## License

MIT
