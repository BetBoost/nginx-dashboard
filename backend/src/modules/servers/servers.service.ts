import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma, Server } from '@prisma/client';

import { PrismaService } from '@common/prisma/prisma.service';
import { CryptoService } from '@common/crypto/crypto.service';
import { SshService } from '@modules/ssh/ssh.service';
import { AuditService } from '@modules/audit/audit.service';
import { paginate, Paginated } from '@common/utils/pagination';

import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';

export type SafeServer = Omit<
  Server,
  'privateKeyEnc' | 'passphraseEnc' | 'passwordEnc'
> & { authMethod: 'key' | 'password' };

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly ssh: SshService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateServerDto, actorId: string): Promise<SafeServer> {
    this.assertExactlyOneCredential(dto.privateKey, dto.password);
    if (dto.privateKey) this.assertKeyLooksValid(dto.privateKey);
    const server = await this.prisma.server.create({
      data: {
        name: dto.name,
        host: dto.host,
        port: dto.port ?? 22,
        username: dto.username,
        privateKeyEnc: dto.privateKey ? this.crypto.encrypt(dto.privateKey) : null,
        passphraseEnc: dto.passphrase ? this.crypto.encrypt(dto.passphrase) : null,
        passwordEnc: dto.password ? this.crypto.encrypt(dto.password) : null,
        nginxPath: dto.nginxPath ?? '/etc/nginx',
        sitesAvailable: dto.sitesAvailable ?? '/etc/nginx/sites-available',
        sitesEnabled: dto.sitesEnabled ?? '/etc/nginx/sites-enabled',
        reloadCommand: dto.reloadCommand ?? 'sudo systemctl reload nginx',
        testCommand: dto.testCommand ?? 'sudo nginx -t',
        certbotEnabled: dto.certbotEnabled ?? true,
        notes: dto.notes,
        ownerId: actorId,
      },
    });
    await this.audit.log({
      action: AuditAction.SERVER_CREATED,
      actorId,
      targetType: 'Server',
      targetId: server.id,
      message: `created server ${server.name} (${server.host})`,
    });
    return this.strip(server);
  }

  async update(id: string, dto: UpdateServerDto, actorId: string): Promise<SafeServer> {
    const data: Prisma.ServerUpdateInput = {
      name: dto.name,
      host: dto.host,
      port: dto.port,
      username: dto.username,
      nginxPath: dto.nginxPath,
      sitesAvailable: dto.sitesAvailable,
      sitesEnabled: dto.sitesEnabled,
      reloadCommand: dto.reloadCommand,
      testCommand: dto.testCommand,
      certbotEnabled: dto.certbotEnabled,
      notes: dto.notes,
    };
    if (dto.privateKey) {
      this.assertKeyLooksValid(dto.privateKey);
      data.privateKeyEnc = this.crypto.encrypt(dto.privateKey);
      data.passwordEnc = null;
    }
    if (dto.passphrase !== undefined) {
      data.passphraseEnc = dto.passphrase ? this.crypto.encrypt(dto.passphrase) : null;
    }
    if (dto.password) {
      data.passwordEnc = this.crypto.encrypt(dto.password);
      data.privateKeyEnc = null;
      data.passphraseEnc = null;
    }
    if (dto.privateKey && dto.password) {
      throw new BadRequestException('Provide either privateKey or password, not both');
    }
    const server = await this.prisma.server.update({ where: { id }, data });
    await this.audit.log({
      action: AuditAction.SERVER_UPDATED,
      actorId,
      targetType: 'Server',
      targetId: server.id,
      message: `updated server ${server.name}`,
    });
    return this.strip(server);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const s = await this.findOrFail(id);
    await this.prisma.server.delete({ where: { id } });
    await this.audit.log({
      action: AuditAction.SERVER_DELETED,
      actorId,
      targetType: 'Server',
      targetId: id,
      message: `deleted server ${s.name}`,
    });
  }

  async list(page = 1, pageSize = 20, q?: string): Promise<Paginated<SafeServer>> {
    const where: Prisma.ServerWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { host: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.server.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { subdomains: true } } },
      }),
      this.prisma.server.count({ where }),
    ]);
    return paginate(items.map((s) => this.strip(s) as SafeServer), total, page, pageSize);
  }

  async findOne(id: string): Promise<SafeServer> {
    return this.strip(await this.findOrFail(id));
  }

  async findOrFail(id: string): Promise<Server> {
    const s = await this.prisma.server.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Server not found');
    return s;
  }

  async testConnection(id: string, actorId: string) {
    const server = await this.findOrFail(id);
    const result = await this.ssh.testConnection(server);
    if (result.ok) {
      await this.prisma.server.update({
        where: { id },
        data: { lastSeenAt: new Date() },
      });
    }
    await this.audit.log({
      action: AuditAction.SERVER_TESTED,
      actorId,
      targetType: 'Server',
      targetId: id,
      message: result.ok ? `connection ok – ${result.uname}` : `connection failed – ${result.error}`,
      meta: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  /** Internal helper — strips secret fields from a server row before returning it. */
  strip(server: Server): SafeServer {
    const { privateKeyEnc, passphraseEnc, passwordEnc, ...safe } = server;
    void passphraseEnc;
    return {
      ...safe,
      authMethod: passwordEnc && !privateKeyEnc ? 'password' : 'key',
    };
  }

  private assertKeyLooksValid(key: string): void {
    if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key)) {
      throw new BadRequestException('privateKey does not look like a PEM-encoded SSH private key');
    }
  }

  private assertExactlyOneCredential(privateKey?: string, password?: string): void {
    if (!privateKey && !password) {
      throw new BadRequestException('Either privateKey or password must be provided');
    }
    if (privateKey && password) {
      throw new BadRequestException('Provide either privateKey or password, not both');
    }
  }
}
