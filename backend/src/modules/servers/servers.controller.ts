import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { ServersService } from './servers.service';
import { CreateServerDto } from './dto/create-server.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthenticatedUser,
} from '@common/decorators/current-user.decorator';
import { PaginationDto } from '@common/utils/pagination';

@ApiTags('servers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Get()
  list(@Query() p: PaginationDto) {
    return this.servers.list(p.page, p.pageSize, p.q);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.servers.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateServerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.servers.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.remove(id, user.id);
  }

  @Post(':id/test')
  test(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servers.testConnection(id, user.id);
  }
}
