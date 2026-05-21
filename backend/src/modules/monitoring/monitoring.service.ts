import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { SslStatus, SubdomainStatus } from '@prisma/client';

import { PrismaService } from '@common/prisma/prisma.service';
import { ServersService } from '@modules/servers/servers.service';
import { NginxService } from '@modules/nginx/nginx.service';
import { SslService } from '@modules/ssl/ssl.service';

export interface SubdomainHealth {
  id: string;
  name: string;
  reachable: boolean;
  responseMs?: number;
  httpStatus?: number;
  error?: string;
  sslDaysRemaining?: number;
}

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly servers: ServersService,
    private readonly nginx: NginxService,
    private readonly ssl: SslService,
  ) {}

  /** Live HTTP(S) probe of a single subdomain — used on demand by the UI. */
  async probeSubdomain(id: string): Promise<SubdomainHealth> {
    const sub = await this.prisma.subdomain.findUnique({ where: { id } });
    if (!sub) throw new Error('subdomain not found');

    const useHttps = sub.sslStatus === SslStatus.ACTIVE;
    const url = `${useHttps ? 'https' : 'http'}://${sub.name}/`;
    const start = Date.now();

    return new Promise<SubdomainHealth>((resolve) => {
      const lib = useHttps ? httpsRequest : httpRequest;
      const req = lib(url, { method: 'HEAD', timeout: 5_000 }, (res) => {
        res.resume();
        resolve({
          id: sub.id,
          name: sub.name,
          reachable: (res.statusCode ?? 0) < 500,
          httpStatus: res.statusCode,
          responseMs: Date.now() - start,
        });
      });
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
      });
      req.on('error', (err) => {
        resolve({
          id: sub.id,
          name: sub.name,
          reachable: false,
          responseMs: Date.now() - start,
          error: err.message,
        });
      });
      req.end();
    });
  }

  /** Aggregate dashboard overview. */
  async overview() {
    const [serverCount, subdomainCount, active, errored, expiringSoon] = await this.prisma.$transaction([
      this.prisma.server.count(),
      this.prisma.subdomain.count(),
      this.prisma.subdomain.count({ where: { status: SubdomainStatus.ACTIVE } }),
      this.prisma.subdomain.count({ where: { status: SubdomainStatus.ERROR } }),
      this.prisma.subdomain.count({
        where: {
          sslStatus: SslStatus.ACTIVE,
          sslExpiresAt: { lt: new Date(Date.now() + 14 * 86400_000) },
        },
      }),
    ]);

    return {
      serverCount,
      subdomainCount,
      activeSubdomains: active,
      errorSubdomains: errored,
      expiringSoon,
    };
  }

  // ── cron jobs ────────────────────────────────────────────────────────

  /** Every 6 hours — refresh SSL expiry info and bump status. */
  @Cron(CronExpression.EVERY_6_HOURS, { name: 'monitoring:ssl-refresh' })
  async refreshSslStatuses(): Promise<void> {
    this.logger.log('Refreshing SSL statuses…');
    const subs = await this.prisma.subdomain.findMany({
      where: { sslStatus: SslStatus.ACTIVE },
      include: { server: true },
    });
    for (const sub of subs) {
      try {
        const cert = await this.ssl.inspect(sub.server, sub.name);
        if (!cert) {
          await this.prisma.subdomain.update({
            where: { id: sub.id },
            data: { sslStatus: SslStatus.ERROR },
          });
          continue;
        }
        const status =
          cert.daysRemaining <= 0
            ? SslStatus.EXPIRED
            : cert.daysRemaining < 14
              ? SslStatus.EXPIRING
              : SslStatus.ACTIVE;
        await this.prisma.subdomain.update({
          where: { id: sub.id },
          data: { sslStatus: status, sslExpiresAt: cert.notAfter },
        });
      } catch (err) {
        this.logger.warn(`SSL refresh failed for ${sub.name}: ${(err as Error).message}`);
      }
    }
  }

  /** Every 10 minutes — bump `lastSeenAt` on reachable servers. */
  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'monitoring:server-heartbeat' })
  async pingServers(): Promise<void> {
    const servers = await this.prisma.server.findMany({ where: { isActive: true } });
    for (const server of servers) {
      try {
        const status = await this.nginx.status(server);
        await this.prisma.server.update({
          where: { id: server.id },
          data: { lastSeenAt: status.running ? new Date() : undefined },
        });
      } catch (err) {
        this.logger.debug(`Heartbeat failed for ${server.name}: ${(err as Error).message}`);
      }
    }
  }
}
