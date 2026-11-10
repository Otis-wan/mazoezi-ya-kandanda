import { validateEnv } from './env.validation.js';

const pem = '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----';
const base = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:long-secret@db:5432/training',
  CORS_ORIGINS: 'https://tms.example.org',
  DOCS_ENABLED: 'false',
  AUTH_PUBLIC_KEY: pem,
};

describe('validateEnv in production', () => {
  it('accepts safe settings', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });
  it('refuses docs', () => {
    expect(() => validateEnv({ ...base, DOCS_ENABLED: 'true' })).toThrow(
      /DOCS_ENABLED/,
    );
  });
  it('refuses * and plain http origins', () => {
    expect(() => validateEnv({ ...base, CORS_ORIGINS: '*' })).toThrow(
      /CORS_ORIGINS/,
    );
    expect(() =>
      validateEnv({ ...base, CORS_ORIGINS: 'http://x.org' }),
    ).toThrow(/https/);
  });
  it('refuses the sample database password', () => {
    expect(() =>
      validateEnv({
        ...base,
        DATABASE_URL: 'postgresql://training:training@db/training',
      }),
    ).toThrow(/sample password/);
  });
  it('lets development use docs and http', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'development',
        DOCS_ENABLED: 'true',
        CORS_ORIGINS: 'http://localhost:5173',
      }),
    ).not.toThrow();
  });
});
