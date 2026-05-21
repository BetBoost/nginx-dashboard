import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '@common/prisma/prisma.service';
import { paginate, Paginated } from '@common/utils/pagination';

export interface AuditEvent {
  action: AuditAction;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  message?: string;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: event.action,
          actorId: event.actorId ?? null,
          targetType: event.targetType,
          targetId: event.targetId,
          ip: event.ip,
          userAgent: event.userAgent,
          message: event.message,
          meta: event.meta as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (err) {
      // Auditing must never break the calling request.
      this.logger.error('Failed to write audit log', (err as Error).stack);
    }
  }

  async list(
    page = 1,
    pageSize = 50,
    filters: { action?: AuditAction; actorId?: string; q?: string } = {},
  ): Promise<Paginated<unknown>> {
    const where: Prisma.AuditLogWhereInput = {
      action: filters.action,
      actorId: filters.actorId,
      ...(filters.q
        ? {
            OR: [
              { message: { contains: filters.q, mode: 'insensitive' } },
              { targetType: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(items, total, page, pageSize);
  }
}
