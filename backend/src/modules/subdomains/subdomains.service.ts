import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  Prisma,
  SslStatus,
  Subdomain,
  SubdomainStatus,
} from '@prisma/client';

import { PrismaService } from '@common/prisma/prisma.service';
import { paginate, Paginated } from '@common/utils/pagination';
import { AuditService } from '@modules/audit/audit.service';
import { ServersService } from '@modules/servers/servers.service';
import { NginxService } from '@modules/nginx/nginx.service';
import { NginxTemplateService } from '@modules/nginx/nginx-template.service';
import { SslService } from '@modules/ssl/ssl.service';

import { CreateSubdomainDto } from './dto/create-subdomain.dto';
import { UpdateSubdomainDto } from './dto/update-subdomain.dto';

export interface RemoveSummary {
  id: string;
  name: string;
  dbDeleted: boolean;
  nginx: { configRemoved: boolean; enabledRemoved: boolean; reloadOk: boolean };
  ssl: { liveRemoved: boolean; renewalRemoved: boolean; archiveRemoved: boolean };
  warnings: string[];
}

@Injectable()
export class SubdomainsService {
  private readonly logger = new Logger(SubdomainsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly servers: ServersService,
    private readonly nginx: NginxService,
    private readonly nginxTemplate: NginxTemplateService,
    private readonly ssl: SslService,
    private readonly audit: AuditService,
  ) {}

  async list(
    page = 1,
    pageSize = 20,
    filters: { q?: string; serverId?: string; status?: SubdomainStatus } = {},
  ): Promise<Paginated<Subdomain>> {
    const where: Prisma.SubdomainWhereInput = {
      serverId: filters.serverId,
      status: filters.status,
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: 'insensitive' } },
              { upstreamHost: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.subdomain.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { server: { select: { id: true, name: true, host: true } } },
      }),
      this.prisma.subdomain.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }

  async findOne(id: string): Promise<Subdomain> {
    const sub = await this.prisma.subdomain.findUnique({
      where: { id },
      include: { server: { select: { id: true, name: true, host: true, certbotEnabled: true } } },
    });
    if (!sub) throw new NotFoundException('Subdomain not found');
    return sub;
  }

  // ── lifecycle ───────────────────────────────────────────────────────

  async create(dto: CreateSubdomainDto, actorId: string): Promise<Subdomain> {
    if (!NginxTemplateService.isValidDomain(dto.name)) {
      throw new BadRequestException('invalid domain');
    }
    const server = await this.servers.findOrFail(dto.serverId);

    const sub = await this.prisma.subdomain.create({
      data: {
        name: dto.name.toLowerCase(),
        serverId: dto.serverId,
        upstreamHost: dto.upstreamHost,
        upstreamPort: dto.upstreamPort ?? 80,
        upstreamScheme: dto.upstreamScheme ?? 'http',
        forceHttps: dto.forceHttps ?? true,
        websocket: dto.websocket ?? false,
        customDirectives: dto.customDirectives,
        clientMaxBodySize: dto.clientMaxBodySize,
        status: SubdomainStatus.PENDING,
      },
    });

    try {
      // 1. Deploy HTTP-only first so certbot can solve the ACME challenge.
      const httpConfig = this.nginxTemplate.fromSubdomain(sub, false);
      const deploy = await this.nginx.deployConfig(server, sub.name, httpConfig, true);

      // 2. (optional) issue cert and re-deploy with the SSL template.
      if (dto.issueSsl ?? true) {
        if (!server.certbotEnabled) {
          throw new BadRequestException('Certbot disabled on the selected server');
        }
        await this.ssl.issue(server, sub.name, process.env.ACME_EMAIL ?? 'admin@example.com');
        const cert = await this.ssl.inspect(server, sub.name);

        await this.prisma.subdomain.update({
          where: { id: sub.id },
          data: {
            sslStatus: SslStatus.ACTIVE,
            sslExpiresAt: cert?.notAfter,
          },
        });

        const httpsConfig = this.nginxTemplate.fromSubdomain(
          { ...sub, sslStatus: SslStatus.ACTIVE },
          true,
        );
        await this.nginx.deployConfig(server, sub.name, httpsConfig, true);
      }

      const updated = await this.prisma.subdomain.update({
        where: { id: sub.id },
        data: {
          status: SubdomainStatus.ACTIVE,
          configPath: deploy.configPath,
          enabledPath: deploy.enabledPath,
          lastReloadOk: true,
          lastError: null,
        },
      });

      await this.audit.log({
        action: AuditAction.SUBDOMAIN_CREATED,
        actorId,
        targetType: 'Subdomain',
        targetId: sub.id,
        message: `created ${sub.name} → ${dto.upstreamHost}:${dto.upstreamPort ?? 80}`,
      });
      return updated;
    } catch (err) {
      await this.prisma.subdomain.update({
        where: { id: sub.id },
        data: {
          status: SubdomainStatus.ERROR,
          lastError: (err as Error).message,
          lastReloadOk: false,
        },
      });
      throw err;
    }
  }

  async update(id: string, dto: UpdateSubdomainDto, actorId: string): Promise<Subdomain> {
    const existing = await this.findOne(id);
    const server = await this.servers.findOrFail(existing.serverId);

    const updated = await this.prisma.subdomain.update({
      where: { id },
      data: {
        upstreamHost: dto.upstreamHost,
        upstreamPort: dto.upstreamPort,
        upstreamScheme: dto.upstreamScheme,
        forceHttps: dto.forceHttps,
        websocket: dto.websocket,
        customDirectives: dto.customDirectives,
        clientMaxBodySize: dto.clientMaxBodySize,
      },
    });

    const withSsl = updated.sslStatus === SslStatus.ACTIVE;
    const config = this.nginxTemplate.fromSubdomain(updated, withSsl);
    try {
      await this.nginx.deployConfig(
        server,
        updated.name,
        config,
        updated.status === SubdomainStatus.ACTIVE,
      );
      await this.prisma.subdomain.update({
        where: { id },
        data: { lastReloadOk: true, lastError: null },
      });
    } catch (err) {
      await this.prisma.subdomain.update({
        where: { id },
        data: {
          lastReloadOk: false,
          lastError: (err as Error).message,
          status: SubdomainStatus.ERROR,
        },
      });
      throw err;
    }

    await this.audit.log({
      action: AuditAction.SUBDOMAIN_UPDATED,
      actorId,
      targetType: 'Subdomain',
      targetId: id,
      message: `updated ${updated.name}`,
    });
    return updated;
  }

  async setEnabled(id: string, enabled: boolean, actorId: string): Promise<Subdomain> {
    const sub = await this.findOne(id);
    const server = await this.servers.findOrFail(sub.serverId);

    if (enabled) {
      const config = this.nginxTemplate.fromSubdomain(sub, sub.sslStatus === SslStatus.ACTIVE);
      await this.nginx.deployConfig(server, sub.name, config, true);
    } else {
      await this.nginx.disable(server, sub.name);
    }

    const updated = await this.prisma.subdomain.update({
      where: { id },
      data: { status: enabled ? SubdomainStatus.ACTIVE : SubdomainStatus.DISABLED },
    });

    await this.audit.log({
      action: enabled ? AuditAction.SUBDOMAIN_ENABLED : AuditAction.SUBDOMAIN_DISABLED,
      actorId,
      targetType: 'Subdomain',
      targetId: id,
      message: `${enabled ? 'enabled' : 'disabled'} ${sub.name}`,
    });
    return updated;
  }

  /**
   * Full subdomain teardown. Each step is independent; failures are
   * collected into `warnings` so a partial outage on the remote box never
   * leaves a zombie DB row that the UI can't get rid of.
   *
   * Order matters:
   *   1. nginx remove (sites-enabled + sites-available + reload)
   *   2. ssl remove   (certbot delete + live/archive/renewal cleanup)
   *   3. db delete    (always — even if 1/2 partially failed)
   *   4. audit log
   */
  async remove(id: string, actorId: string): Promise<RemoveSummary> {
    const sub = await this.findOne(id);

    const summary: RemoveSummary = {
      id: sub.id,
      name: sub.name,
      dbDeleted: false,
      nginx: { configRemoved: false, enabledRemoved: false, reloadOk: false },
      ssl: { liveRemoved: false, renewalRemoved: false, archiveRemoved: false },
      warnings: [],
    };

    // The Server row may have been removed independently (it cascades, so we
    // shouldn't normally hit this — but defend against it anyway).
    let server: Awaited<ReturnType<ServersService['findOrFail']>> | null = null;
    try {
      server = await this.servers.findOrFail(sub.serverId);
    } catch (err) {
      summary.warnings.push(
        `server ${sub.serverId} not found — skipping remote cleanup (${(err as Error).message})`,
      );
    }

    // 1. nginx
    if (server) {
      try {
        const r = await this.nginx.remove(server, sub.name);
        summary.nginx = {
          configRemoved: r.configRemoved,
          enabledRemoved: r.enabledRemoved,
          reloadOk: r.reloadOk,
        };
        summary.warnings.push(...r.warnings.map((w) => `nginx: ${w}`));
      } catch (err) {
        summary.warnings.push(`nginx: ${(err as Error).message}`);
        this.logger.error(`nginx.remove(${sub.name}) crashed: ${(err as Error).message}`);
      }

      // 2. ssl
      try {
        const r = await this.ssl.remove(server, sub.name);
        summary.ssl = {
          liveRemoved: r.liveRemoved,
          renewalRemoved: r.renewalRemoved,
          archiveRemoved: r.archiveRemoved,
        };
        summary.warnings.push(...r.warnings.map((w) => `ssl: ${w}`));
      } catch (err) {
        summary.warnings.push(`ssl: ${(err as Error).message}`);
        this.logger.error(`ssl.remove(${sub.name}) crashed: ${(err as Error).message}`);
      }
    }

    // 3. db — always attempt, even if the remote steps were partial. We
    //    deliberately swallow P2025 ("record not found") so a double-delete
    //    is a no-op rather than a 404.
    try {
      await this.prisma.subdomain.delete({ where: { id } });
      summary.dbDeleted = true;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        summary.dbDeleted = true; // already gone
      } else {
        summary.warnings.push(`db: ${(err as Error).message}`);
        this.logger.error(`prisma delete(${sub.id}) failed: ${(err as Error).message}`);
        // This is the one failure mode where the user actually needs to
        // retry — surface as 502 so the UI shows a real error.
        throw err;
      }
    }

    // 4. audit
    await this.audit
      .log({
        action: AuditAction.SUBDOMAIN_DELETED,
        actorId,
        targetType: 'Subdomain',
        targetId: id,
        message: `deleted ${sub.name}${
          summary.warnings.length ? ` (with warnings: ${summary.warnings.join(' | ')})` : ''
        }`,
        meta: summary as unknown as Record<string, unknown>,
      })
      .catch((e) =>
        this.logger.error(`audit log for delete(${sub.name}) failed: ${(e as Error).message}`),
      );

    this.logger.log(
      `deleted subdomain ${sub.name} — nginx.reloadOk=${summary.nginx.reloadOk} ssl.renewalRemoved=${summary.ssl.renewalRemoved} warnings=${summary.warnings.length}`,
    );

    return summary;
  }

  /**
   * Renew the cert if a valid lineage exists; otherwise issue a fresh one
   * and reconfigure nginx to use it. Never crashes on a broken renewal
   * config — self-heals instead.
   */
  async renewSsl(id: string, actorId: string): Promise<Subdomain> {
    const sub = await this.findOne(id);
    const server = await this.servers.findOrFail(sub.serverId);

    let issued = false;
    let renewed = false;
    let detail = '';

    const safeResult = await this.ssl.safeRenew(server, sub.name);
    if (safeResult.renewed) {
      renewed = true;
      detail = 'renewed';
    } else {
      // No usable lineage — issue from scratch.
      if (!server.certbotEnabled) {
        throw new BadRequestException('Certbot disabled on the selected server');
      }
      this.logger.log(
        `safeRenew(${sub.name}) skipped (${safeResult.reason}); issuing fresh cert`,
      );
      await this.ssl.issue(
        server,
        sub.name,
        process.env.ACME_EMAIL ?? 'admin@example.com',
      );
      issued = true;
      detail = `issued (was: ${safeResult.reason ?? 'missing'})`;

      // Re-render with the SSL template so the new cert is actually used.
      const httpsConfig = this.nginxTemplate.fromSubdomain(
        { ...sub, sslStatus: SslStatus.ACTIVE },
        true,
      );
      await this.nginx.deployConfig(server, sub.name, httpsConfig, true);
    }

    const cert = await this.ssl.inspect(server, sub.name);
    const updated = await this.prisma.subdomain.update({
      where: { id },
      data: {
        sslStatus: cert ? SslStatus.ACTIVE : SslStatus.ERROR,
        sslExpiresAt: cert?.notAfter,
      },
    });
    await this.audit.log({
      action: AuditAction.SSL_RENEWED,
      actorId,
      targetType: 'Subdomain',
      targetId: id,
      message: `${issued ? 'issued' : renewed ? 'renewed' : 'no-op'} cert for ${sub.name} (${detail})`,
      meta: cert as unknown as Record<string, unknown>,
    });
    return updated;
  }

  /** Returns the rendered nginx config — used by the "show config" UI tab. */
  async previewConfig(id: string): Promise<string> {
    const sub = await this.findOne(id);
    return this.nginxTemplate.fromSubdomain(sub, sub.sslStatus === SslStatus.ACTIVE);
  }
}
