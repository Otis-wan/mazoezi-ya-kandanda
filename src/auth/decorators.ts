import {
  createParamDecorator,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthedRequest, AuthUser } from './auth-user.js';
import type { Role } from './roles.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw new UnauthorizedException();
    return user;
  },
);