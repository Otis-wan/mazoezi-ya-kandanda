import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AuthedRequest } from '../auth/auth-user.js';

const WINDOW_MS = 60_000;

const request = (context: ExecutionContext) =>
  context.switchToHttp().getRequest<AuthedRequest>();
const hasUser = (context: ExecutionContext) => Boolean(request(context).user);
const isRead = (context: ExecutionContext) =>
  ['GET', 'HEAD', 'OPTIONS'].includes(request(context).method);

export interface Limits {
  perAddress: number;
  perUser: number;
  writesPerUser: number;
}

/**
 * Three limits:
 * - ip:    each address, counted before sign-in. Stops floods of bad tokens.
 * - user:  each signed-in user on each route.
 * - write: each signed-in user on each route that changes data.
 */
export function throttleOptions(limits: Limits): ThrottlerModuleOptions {
  return [
    { name: 'ip', ttl: WINDOW_MS, limit: limits.perAddress, skipIf: hasUser },
    {
      name: 'user',
      ttl: WINDOW_MS,
      limit: limits.perUser,
      skipIf: (c) => !hasUser(c),
    },
    {
      name: 'write',
      ttl: WINDOW_MS,
      limit: limits.writesPerUser,
      skipIf: (c) => !hasUser(c) || isRead(c),
    },
  ];
}

/** Runs before sign-in. Counts by address. */
@Injectable()
export class AddressThrottlerGuard extends ThrottlerGuard {}

/** Runs after sign-in. Counts by user id. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override shouldSkip(context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(!hasUser(context));
  }

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const user = (req as { user?: { id: string } }).user;
    return Promise.resolve(`user:${user?.id ?? 'none'}`);
  }
}
