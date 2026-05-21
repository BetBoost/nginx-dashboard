import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UsersService } from '@modules/users/users.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService, private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwt.accessSecret')!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.users.findById(payload.sub);
    if (!user.isActive) throw new UnauthorizedException('User disabled');
    return { id: user.id, email: user.email, role: user.role };
  }
}
