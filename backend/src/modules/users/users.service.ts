import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { Prisma, Role, User } from '@prisma/client';

import { PrismaService } from '@common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { paginate, Paginated } from '@common/utils/pagination';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Seed the first admin user from env on first boot. */
  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('app.admin.email');
    if (!email) return;
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) return;

    const password = this.config.get<string>('app.admin.password')!;
    await this.prisma.user.create({
      data: {
        email,
        name: 'Administrator',
        role: Role.ADMIN,
        passwordHash: await argon2.hash(password),
      },
    });
    this.logger.warn(`Bootstrapped admin user ${email} — change the password!`);
  }

  async create(dto: CreateUserDto): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        name: dto.name,
        role: dto.role ?? Role.USER,
        isActive: dto.isActive ?? true,
        passwordHash: await argon2.hash(dto.password),
      },
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const data: Prisma.UserUpdateInput = {
      email: dto.email?.toLowerCase(),
      name: dto.name,
      role: dto.role,
      isActive: dto.isActive,
    };
    if (dto.password) {
      data.passwordHash = await argon2.hash(dto.password);
    }
    return this.prisma.user.update({ where: { id }, data });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  async findById(id: string): Promise<User> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  async list(
    page = 1,
    pageSize = 20,
    q?: string,
  ): Promise<Paginated<Omit<User, 'passwordHash' | 'refreshToken'>>> {
    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(items as never, total, page, pageSize);
  }

  async setRefreshTokenHash(id: string, hash: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { refreshToken: hash },
    });
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }
}
