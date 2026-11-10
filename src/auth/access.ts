import type { AuthUser } from './auth-user.js';
import { Role } from './roles.js';

export function isStaffWide(user: AuthUser): boolean {
  return user.role === Role.ADMIN || user.role === Role.SUPER_AGENT;
}

export function canAccessTeam(user: AuthUser, teamExternalId: string): boolean {
  return isStaffWide(user) || user.teamIds.includes(teamExternalId);
}

/**
 * Who may see one player's work: a player sees themselves, a team manager
 * sees players in their teams, admins see everyone. One rule, used by
 * assignments and progress alike.
 */
export function canViewPlayer(
  user: AuthUser,
  player: { externalId: string; team: { externalId: string } | null },
): boolean {
  if (user.role === Role.PLAYER) return player.externalId === user.id;
  if (isStaffWide(user)) return true;
  return player.team !== null && user.teamIds.includes(player.team.externalId);
}
