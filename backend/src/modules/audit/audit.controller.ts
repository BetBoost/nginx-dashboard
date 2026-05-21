import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAction, Role } from '@prisma/client';

import { AuditService } from './audit.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { PaginationDto } from '@common/utils/pagination';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query() pagination: PaginationDto,
    @Query('action') action?: AuditAction,
    @Query('actorId') actorId?: string,
  ) {
    return this.audit.list(pagination.page, pagination.pageSize, {
      action,
      actorId,
      q: pagination.q,
    });
  }
}
