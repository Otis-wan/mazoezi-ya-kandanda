import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
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

  // All calls come from the main site's server, so this covers every user.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  RATE_LIMIT_PER_MINUTE: number = 600;

  // Public key (PEM) that checks the tokens the main site signs.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\\n/g, '\n').trim() : value,
  )
  @IsString()
  @Matches(/^-----BEGIN PUBLIC KEY-----/, {
    message: 'AUTH_PUBLIC_KEY must be a PEM public key',
  })
  AUTH_PUBLIC_KEY!: string;

  @IsString()
  @MinLength(1)
  AUTH_ISSUER: string = 'tms-site';

  @IsString()
  @MinLength(1)
  AUTH_AUDIENCE: string = 'training-api';
}

export function validateEnv(config: Record<string, unknown>): Env {
  const env = plainToInstance(Env, config, { exposeDefaultValues: true });
  const errors = validateSync(env);
  if (errors.length > 0) {
    const lines = errors.map(
      (e) => `- ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
    );
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return env;
}