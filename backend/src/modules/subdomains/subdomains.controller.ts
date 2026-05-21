import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { SubdomainsService } from './subdomains.service';
import { CreateSubdomainDto } from './dto/create-subdomain.dto';
import { UpdateSubdomainDto } from './dto/update-subdomain.dto';
import { ListSubdomainsQueryDto } from './dto/list-subdomains.query';

import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '@common/decorators/current-user.decorator';

@ApiTags('subdomains')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subdomains')
export class SubdomainsController {
  constructor(private readonly subdomains: SubdomainsService) {}

  @Get()
  list(@Query() q: ListSubdomainsQueryDto) {
    return this.subdomains.list(q.page, q.pageSize, {
      q: q.q,
      serverId: q.serverId,
      status: q.status,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.subdomains.findOne(id);
  }

  @Get(':id/config')
  preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.subdomains.previewConfig(id).then((config) => ({ config }));
  }

  @Post()
  @Roles(Role.ADMIN, Role.USER)
  create(@Body() dto: CreateSubdomainDto, @CurrentUser() user: AuthenticatedUser) {
    return this.subdomains.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.USER)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubdomainDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subdomains.update(id, dto, user.id);
  }

  @Post(':id/enable')
  enable(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.subdomains.setEnabled(id, true, user.id);
  }

  @Post(':id/disable')
  disable(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.subdomains.setEnabled(id, false, user.id);
  }

  @Post(':id/renew-ssl')
  renew(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.subdomains.renewSsl(id, user.id);
  }

  /**
   * Delete returns 200 with a structured summary (instead of 204) so the UI
   * can show partial-success information (e.g. "vhost removed but reload
   * failed"). Restricted to ADMIN — matches the original policy.
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.subdomains.remove(id, user.id);
  }
}
