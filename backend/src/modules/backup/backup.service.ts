import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { AuditAction } from '@prisma/client';

import { PrismaService } from '@common/prisma/prisma.service';
import { ServersService } from '@modules/servers/servers.service';
import { SshService } from '@modules/ssh/ssh.service';
import { NginxService } from '@modules/nginx/nginx.service';
import { AuditService } from '@modules/audit/audit.service';

const BACKUP_DIR = process.env.BACKUP_DIR ?? '/var/lib/nginx-dashboard/backups';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly servers: ServersService,
    private readonly ssh: SshService,
    private readonly nginx: NginxService,
    private readonly audit: AuditService,
  ) {}

  async list(serverId?: string) {
    return this.prisma.configBackup.findMany({
      where: serverId ? { serverId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { server: { select: { id: true, name: true } } },
    });
  }

  async create(serverId: string, actorId: string, note?: string) {
    const server = await this.servers.findOrFail(serverId);
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${server.id}-${stamp}.tar.gz`;
    const localPath = join(BACKUP_DIR, filename);
    const remoteTmp = `/tmp/${filename}`;

    // Create archive on the remote then download via cat over the ssh channel.
    const tarCmd = `sudo tar -czf ${remoteTmp} ` +
      `-C / ${stripLeading(server.sitesAvailable)} ${stripLeading(server.sitesEnabled)}`;
    const tar = await this.ssh.exec(server, tarCmd, { timeoutMs: 120_000 });
    if ((tar.code ?? 0) !== 0) {
      throw new BadGatewayException(`tar failed: ${tar.stderr.trim()}`);
    }

    const dump = await this.ssh.exec(server, `sudo cat ${remoteTmp} | base64`, { timeoutMs: 120_000 });
    await this.ssh.exec(server, `sudo rm -f ${remoteTmp}`);

    const buf = Buffer.from(dump.stdout.replace(/\s+/g, ''), 'base64');
    await fs.writeFile(localPath, buf);

    const record = await this.prisma.configBackup.create({
      data: {
        serverId,
        filename,
        sizeBytes: buf.length,
        note,
      },
    });

    await this.audit.log({
      action: AuditAction.BACKUP_CREATED,
      actorId,
      targetType: 'Server',
      targetId: serverId,
      message: `backup ${filename} (${buf.length} bytes)`,
    });
    return record;
  }

  async restore(backupId: string, actorId: string) {
    const backup = await this.prisma.configBackup.findUnique({ where: { id: backupId } });
    if (!backup) throw new NotFoundException('Backup not found');
    const server = await this.servers.findOrFail(backup.serverId);

    const localPath = join(BACKUP_DIR, backup.filename);
    const blob = await fs.readFile(localPath);
    const b64 = blob.toString('base64');
    const remoteTmp = `/tmp/restore-${backup.id}.tar.gz`;

    const write = await this.ssh.exec(
      server,
      `base64 -d > ${remoteTmp}`,
      { stdin: b64, timeoutMs: 120_000 },
    );
    if ((write.code ?? 0) !== 0) {
      throw new BadGatewayException(`upload failed: ${write.stderr.trim()}`);
    }

    const extract = await this.ssh.exec(
      server,
      `sudo tar -xzf ${remoteTmp} -C / && sudo rm -f ${remoteTmp}`,
      { timeoutMs: 60_000 },
    );
    if ((extract.code ?? 0) !== 0) {
      throw new BadGatewayException(`extract failed: ${extract.stderr.trim()}`);
    }

    await this.nginx.reload(server);

    await this.audit.log({
      action: AuditAction.BACKUP_RESTORED,
      actorId,
      targetType: 'Server',
      targetId: server.id,
      message: `restored backup ${backup.filename}`,
    });
    return { ok: true };
  }
}

function stripLeading(p: string): string {
  return p.replace(/^\/+/, '');
}
