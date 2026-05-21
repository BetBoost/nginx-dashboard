-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "SubdomainStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED', 'ERROR');

-- CreateEnum
CREATE TYPE "SslStatus" AS ENUM ('NONE', 'PENDING', 'ACTIVE', 'EXPIRING', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('USER_LOGIN', 'USER_LOGOUT', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'SERVER_CREATED', 'SERVER_UPDATED', 'SERVER_DELETED', 'SERVER_TESTED', 'SUBDOMAIN_CREATED', 'SUBDOMAIN_UPDATED', 'SUBDOMAIN_DELETED', 'SUBDOMAIN_ENABLED', 'SUBDOMAIN_DISABLED', 'SSL_ISSUED', 'SSL_RENEWED', 'SSL_REVOKED', 'NGINX_RELOADED', 'BACKUP_CREATED', 'BACKUP_RESTORED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "refreshToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" TEXT NOT NULL,
    "privateKeyEnc" TEXT NOT NULL,
    "passphraseEnc" TEXT,
    "nginxPath" TEXT NOT NULL DEFAULT '/etc/nginx',
    "sitesAvailable" TEXT NOT NULL DEFAULT '/etc/nginx/sites-available',
    "sitesEnabled" TEXT NOT NULL DEFAULT '/etc/nginx/sites-enabled',
    "reloadCommand" TEXT NOT NULL DEFAULT 'sudo systemctl reload nginx',
    "testCommand" TEXT NOT NULL DEFAULT 'sudo nginx -t',
    "certbotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "notes" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subdomain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "upstreamHost" TEXT NOT NULL,
    "upstreamPort" INTEGER NOT NULL DEFAULT 80,
    "upstreamScheme" TEXT NOT NULL DEFAULT 'http',
    "forceHttps" BOOLEAN NOT NULL DEFAULT true,
    "websocket" BOOLEAN NOT NULL DEFAULT false,
    "customDirectives" TEXT,
    "clientMaxBodySize" TEXT,
    "status" "SubdomainStatus" NOT NULL DEFAULT 'PENDING',
    "sslStatus" "SslStatus" NOT NULL DEFAULT 'NONE',
    "sslExpiresAt" TIMESTAMP(3),
    "lastReloadOk" BOOLEAN,
    "lastError" TEXT,
    "configPath" TEXT,
    "enabledPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subdomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigBackup" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Server_host_port_key" ON "Server"("host", "port");

-- CreateIndex
CREATE INDEX "Subdomain_name_idx" ON "Subdomain"("name");

-- CreateIndex
CREATE INDEX "Subdomain_status_idx" ON "Subdomain"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Subdomain_serverId_name_key" ON "Subdomain"("serverId", "name");

-- CreateIndex
CREATE INDEX "ConfigBackup_serverId_idx" ON "ConfigBackup"("serverId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subdomain" ADD CONSTRAINT "Subdomain_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfigBackup" ADD CONSTRAINT "ConfigBackup_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
