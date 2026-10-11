import type { AuthUser } from './auth-user.js';
import { assertTeamAccess, canAccessTeam, visibleTeamIds } from './access.js';
import { Role } from './roles.js';

const admin: AuthUser = { id: '1', role: Role.ADMIN, teamIds: [] };
const manager: AuthUser = { id: '2', role: Role.TEAM_MANAGER, teamIds: ['10', '11'] };

describe('team access', () => {
  it('lets admins see every team', () => {
    expect(canAccessTeam(admin, '99')).toBe(true);
    expect(visibleTeamIds(admin)).toBe('all');
  });

  it('limits a team manager to their own teams', () => {
    expect(canAccessTeam(manager, '10')).toBe(true);
    expect(canAccessTeam(manager, '99')).toBe(false);
    expect(visibleTeamIds(manager)).toEqual(['10', '11']);
  });

  it('throws for a team the manager does not own', () => {
    expect(() => assertTeamAccess(manager, '99')).toThrow('do not manage');
  });
});