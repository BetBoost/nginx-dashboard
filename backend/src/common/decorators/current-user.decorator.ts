import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    return ctx.switchToHttp().getRequest().user as AuthenticatedUser;
  },
);
