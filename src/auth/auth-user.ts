import type { Request } from 'express';
import type { Role } from './roles.js';

export interface AuthUser {
  id: string;
  role: Role;
  /** Team IDs as text, to match Team.externalId. Empty for admins. */
  teamIds: string[];
}

export type AuthedRequest = Request & { user?: AuthUser };