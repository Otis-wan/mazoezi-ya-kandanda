import type { AuthUser } from './auth-user.js';
import { canAccessTeam, canViewPlayer } from './access.js';
import { Role } from './roles.js';

const admin: AuthUser = { id: '1', role: Role.ADMIN, teamIds: [] };
const manager: AuthUser = {
  id: '2',
  role: Role.TEAM_MANAGER,
  teamIds: ['10', '11'],
};
const player: AuthUser = { id: '101', role: Role.PLAYER, teamIds: [] };

describe('team access', () => {
  it('lets admins see every team', () => {
    expect(canAccessTeam(admin, '99')).toBe(true);
  });

  it('limits a team manager to their own teams', () => {
    expect(canAccessTeam(manager, '10')).toBe(true);
    expect(canAccessTeam(manager, '99')).toBe(false);
  });
});

describe('who may see a player', () => {
  const inTeam10 = { externalId: '101', team: { externalId: '10' } };
  const inTeam99 = { externalId: '555', team: { externalId: '99' } };
  const noTeam = { externalId: '777', team: null };

  it('lets admins see everyone', () => {
    expect(canViewPlayer(admin, inTeam99)).toBe(true);
    expect(canViewPlayer(admin, noTeam)).toBe(true);
  });

  it('lets a team manager see players in their teams only', () => {
    expect(canViewPlayer(manager, inTeam10)).toBe(true);
    expect(canViewPlayer(manager, inTeam99)).toBe(false);
    expect(canViewPlayer(manager, noTeam)).toBe(false);
  });

  it('lets a player see only themselves', () => {
    expect(canViewPlayer(player, inTeam10)).toBe(true);
    expect(canViewPlayer(player, inTeam99)).toBe(false);
  });
});
