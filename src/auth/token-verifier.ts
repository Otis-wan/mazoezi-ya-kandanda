import { importSPKI, jwtVerify, type JWTPayload } from 'jose';

type VerifyKey = Awaited<ReturnType<typeof importSPKI>>;

export interface TokenVerifierOptions {
  publicKeyPem: string;
  issuer: string;
  audience: string;
}

export interface VerifiedToken {
  userId: string;
  roleId: number;
  teamIds: string[];
}

export class TokenError extends Error {}

const MAX_TEAMS = 500;

export class TokenVerifier {
  constructor(
    private readonly key: VerifyKey,
    private readonly options: TokenVerifierOptions,
  ) {}

  /** Fails at startup if the key is bad, so a wrong setting is never silent. */
  static async create(options: TokenVerifierOptions): Promise<TokenVerifier> {
    const key = await importSPKI(options.publicKeyPem, 'ES256');
    return new TokenVerifier(key, options);
  }

  async verify(token: string): Promise<VerifiedToken> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.key, {
        algorithms: ['ES256'],
        issuer: this.options.issuer,
        audience: this.options.audience,
        maxTokenAge: '10m',
        clockTolerance: 5,
        requiredClaims: ['sub', 'exp', 'iat'],
      }));
    } catch (err) {
      throw new TokenError(err instanceof Error ? err.name : 'verification failed');
    }
    return parseClaims(payload);
  }
}

function parseClaims(payload: JWTPayload): VerifiedToken {
  const { sub, role, teams } = payload;
  if (typeof sub !== 'string' || sub.length === 0 || sub.length > 64) {
    throw new TokenError('bad sub');
  }
  if (typeof role !== 'number' || !Number.isInteger(role)) {
    throw new TokenError('bad role');
  }
  if (
    !Array.isArray(teams) ||
    teams.length > MAX_TEAMS ||
    !teams.every((t) => typeof t === 'number' && Number.isInteger(t) && t > 0)
  ) {
    throw new TokenError('bad teams');
  }
  return {
    userId: sub,
    roleId: role,
    teamIds: [...new Set(teams.map(String))],
  };
}