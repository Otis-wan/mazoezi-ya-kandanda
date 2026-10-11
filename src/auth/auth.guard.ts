import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from './auth-user.js';
import { IS_PUBLIC_KEY } from './decorators.js';
import { ROLE_BY_ID } from './roles.js';
import { TokenError, TokenVerifier, type VerifiedToken } from './token-verifier.js';

const MAX_TOKEN_LENGTH = 4096;

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = readBearer(req.headers.authorization);
    if (!token) throw new UnauthorizedException('Missing bearer token');

    let verified: VerifiedToken;
    try {
      verified = await this.tokens.verify(token);
    } catch (err) {
      if (err instanceof TokenError) {
        this.logger.warn(`Token rejected: ${err.message}`);
        throw new UnauthorizedException('Invalid or expired token');
      }
      throw err;
    }

    const role = ROLE_BY_ID[verified.roleId];
    if (!role) {
      throw new ForbiddenException('This role cannot use the training service');
    }
    req.user = { id: verified.userId, role, teamIds: verified.teamIds };
    return true;
  }
}

function readBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token, ...rest] = header.split(' ');
  if (rest.length > 0 || scheme?.toLowerCase() !== 'bearer') return null;
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}