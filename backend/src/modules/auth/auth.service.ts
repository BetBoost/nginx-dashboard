import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuditAction, User } from '@prisma/client';

import { UsersService } from '@modules/users/users.service';
import { AuditService } from '@modules/audit/audit.service';
import { LoginDto } from './dto/login.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AuthContext {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, ctx: AuthContext): Promise<TokenPair & { user: Partial<User> }> {
    const user = await this.users.findByEmail(dto.email);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      await this.audit.log({
        action: AuditAction.USER_LOGIN,
        message: `failed login for ${dto.email}`,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokens(user);
    await this.users.setRefreshTokenHash(user.id, await argon2.hash(tokens.refreshToken));
    await this.users.touchLastLogin(user.id);

    await this.audit.log({
      action: AuditAction.USER_LOGIN,
      actorId: user.id,
      message: `${user.email} logged in`,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return {
      ...tokens,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async logout(userId: string, ctx: AuthContext): Promise<void> {
    await this.users.setRefreshTokenHash(userId, null);
    await this.audit.log({
      action: AuditAction.USER_LOGOUT,
      actorId: userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string };
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get<string>('auth.jwt.refreshSecret'),
      });
    } catch {
      throw new ForbiddenException('Invalid refresh token');
    }

    const user = await this.users.findById(payload.sub);
    if (!user.refreshToken) throw new ForbiddenException('Session expired');

    const match = await argon2.verify(user.refreshToken, refreshToken);
    if (!match) throw new ForbiddenException('Invalid refresh token');

    const tokens = await this.issueTokens(user);
    await this.users.setRefreshTokenHash(user.id, await argon2.hash(tokens.refreshToken));
    return tokens;
  }

  private async issueTokens(user: User): Promise<TokenPair> {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessTtl = this.config.get<string>('auth.jwt.accessTtl', '15m');
    const refreshTtl = this.config.get<string>('auth.jwt.refreshTtl', '7d');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('auth.jwt.accessSecret'),
        expiresIn: accessTtl,
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('auth.jwt.refreshSecret'),
        expiresIn: refreshTtl,
      }),
    ]);

    return { accessToken, refreshToken, expiresIn: ttlToSeconds(accessTtl) };
  }
}

function ttlToSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 900;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return n;
    case 'm': return n * 60;
    case 'h': return n * 3600;
    case 'd': return n * 86400;
    default: return 900;
  }
}
