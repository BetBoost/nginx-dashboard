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

import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { PaginationDto } from '@common/utils/pagination';
import { CurrentUser, AuthenticatedUser } from '@common/decorators/current-user.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.findById(user.id).then(({ passwordHash, refreshToken, ...rest }) => rest);
  }

  @Get()
  @Roles(Role.ADMIN)
  list(@Query() p: PaginationDto) {
    return this.users.list(p.page, p.pageSize, p.q);
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto).then(({ passwordHash, refreshToken, ...rest }) => rest);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto).then(({ passwordHash, refreshToken, ...rest }) => rest);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.remove(id);
  }
}
