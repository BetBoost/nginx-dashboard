import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { PrismaService } from '@common/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    return { status: db === 'ok' ? 'ok' : 'degraded', db, uptime: process.uptime(), now: new Date().toISOString() };
  }
}
