import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';
import { Role } from './roles.js';

export function isStaffWide(user: AuthUser): boolean {
  return user.role === Role.ADMIN || user.role === Role.SUPER_AGENT;
}

export function canAccessTeam(user: AuthUser, teamExternalId: string): boolean {
  return isStaffWide(user) || user.teamIds.includes(teamExternalId);
}

export function assertTeamAccess(user: AuthUser, teamExternalId: string): void {
  if (!canAccessTeam(user, teamExternalId)) {
    throw new ForbiddenException('You do not manage this team');
  }
}

/** "all" for staff-wide roles, else the team IDs to filter by. */
export function visibleTeamIds(user: AuthUser): 'all' | string[] {
  return isStaffWide(user) ? 'all' : user.teamIds;
}