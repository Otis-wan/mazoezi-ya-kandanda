export const Role = {
  ADMIN: 'ADMIN',
  SUPER_AGENT: 'SUPER_AGENT',
  TEAM_MANAGER: 'TEAM_MANAGER',
  PLAYER: 'PLAYER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/** Role IDs used by the main site's backend. Other IDs have no access. */
export const ROLE_BY_ID: Readonly<Record<number, Role>> = {
  1: Role.ADMIN,
  7: Role.SUPER_AGENT,
  2: Role.TEAM_MANAGER,
  5: Role.PLAYER,
};