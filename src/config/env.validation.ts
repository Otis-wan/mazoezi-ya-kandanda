import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class Env {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: 'development' | 'test' | 'production' = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @Matches(/^postgres(ql)?:\/\/.+/, {
    message: 'DATABASE_URL must start with postgresql://',
  })
  DATABASE_URL!: string;

  // Comma list of sites allowed to call the API. Empty means none.
  @IsString()
  CORS_ORIGINS: string = '';

  // How many proxies sit in front of the API. 0 means none.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY: number = 0;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  DOCS_ENABLED: boolean = false;

  // Limit for each address. All calls come from the main site's server,
  // so this covers every user together.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  RATE_LIMIT_PER_MINUTE: number = 600;

  // Limit for each signed-in user on each route, so one user cannot use up the rest.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  RATE_LIMIT_USER_PER_MINUTE: number = 120;

  // Tighter limit for each user on calls that change data (POST, PUT, PATCH, DELETE).
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  RATE_LIMIT_WRITE_PER_MINUTE: number = 30;

  // Public key (PEM) that checks the tokens the main site signs.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\\n/g, '\n').trim() : value,
  )
  @IsString()
  @Matches(/^-----BEGIN PUBLIC KEY-----/, {
    message: 'AUTH_PUBLIC_KEY must be a PEM public key',
  })
  AUTH_PUBLIC_KEY!: string;

  // Second public key. Set it while the main site moves to a new signing key.
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() !== ''
      ? value.replace(/\\n/g, '\n').trim()
      : undefined,
  )
  @IsOptional()
  @IsString()
  @Matches(/^-----BEGIN PUBLIC KEY-----/, {
    message: 'AUTH_PUBLIC_KEY_NEXT must be a PEM public key',
  })
  AUTH_PUBLIC_KEY_NEXT?: string;

  @IsString()
  @MinLength(1)
  AUTH_ISSUER: string = 'tms-site';

  @IsString()
  @MinLength(1)
  AUTH_AUDIENCE: string = 'training-api';

  // Redis runs the repeat job. Leave it out and daily or weekly assignments do not repeat.
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @Matches(/^rediss?:\/\/.+/, { message: 'REDIS_URL must start with redis://' })
  REDIS_URL?: string;
}

export function validateEnv(config: Record<string, unknown>): Env {
  const env = plainToInstance(Env, config, { exposeDefaultValues: true });
  const errors = validateSync(env);
  if (errors.length > 0) {
    const lines = errors.map(
      (e) =>
        `- ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
    );
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  const unsafe = productionProblems(env);
  if (unsafe.length > 0) {
    throw new Error(
      `Unsafe production settings:\n${unsafe.map((l) => `- ${l}`).join('\n')}`,
    );
  }
  return env;
}

/** Settings that are fine on a laptop but not on a live server. */
function productionProblems(env: Env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  if (env.DOCS_ENABLED) problems.push('DOCS_ENABLED must be false');
  const origins = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origins.includes('*'))
    problems.push('CORS_ORIGINS must list sites, not *');
  if (origins.some((o) => !o.startsWith('https://'))) {
    problems.push('CORS_ORIGINS must use https://');
  }
  if (/training:training@/.test(env.DATABASE_URL)) {
    problems.push('DATABASE_URL uses the sample password');
  }
  return problems;
}
