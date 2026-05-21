import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsOptional, IsString, IsUUID } from 'class-validator';

import { BackupService } from './backup.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '@common/decorators/current-user.decorator';

class CreateBackupDto {
  @IsUUID()
  serverId!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

@ApiTags('backups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('backups')
export class BackupController {
  constructor(private readonly backups: BackupService) {}

  @Get()
  list(@Query('serverId') serverId?: string) {
    return this.backups.list(serverId);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateBackupDto, @CurrentUser() user: AuthenticatedUser) {
    return this.backups.create(dto.serverId, user.id, dto.note);
  }

  @Post(':id/restore')
  @Roles(Role.ADMIN)
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.backups.restore(id, user.id);
  }
}
