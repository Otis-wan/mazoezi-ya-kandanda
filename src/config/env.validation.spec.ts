import { validateEnv } from './env.validation.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  AUTH_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
};

describe('validateEnv', () => {
  it('fills in defaults', () => {
    const env = validateEnv(base);
    expect(env.PORT).toBe(3000);
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.DOCS_ENABLED).toBe(false);
    expect(env.CORS_ORIGINS).toBe('');
  });

  it('reads numbers and booleans from text', () => {
    const env = validateEnv({
      ...base,
      PORT: '4000',
      TRUST_PROXY: '1',
      DOCS_ENABLED: 'true',
    });
    expect(env.PORT).toBe(4000);
    expect(env.TRUST_PROXY).toBe(1);
    expect(env.DOCS_ENABLED).toBe(true);
  });

  it('treats the text "false" as false', () => {
    expect(validateEnv({ ...base, DOCS_ENABLED: 'false' }).DOCS_ENABLED).toBe(false);
  });

  it('rejects a missing database url', () => {
    expect(() => validateEnv({})).toThrow('DATABASE_URL');
  });

  it('rejects a bad port', () => {
    expect(() => validateEnv({ ...base, PORT: '99999' })).toThrow('PORT');
  });

    it('defaults the rate limit and token names', () => {
    const env = validateEnv(base);
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(600);
    expect(env.AUTH_ISSUER).toBe('tms-site');
    expect(env.AUTH_AUDIENCE).toBe('training-api');
  });

  it('rejects a missing public key', () => {
    expect(() => validateEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow('AUTH_PUBLIC_KEY');
  });

  it('rejects a key that is not a PEM public key', () => {
    expect(() => validateEnv({ ...base, AUTH_PUBLIC_KEY: 'hello' })).toThrow('AUTH_PUBLIC_KEY');
  });

  it('turns literal \\n in the key into new lines', () => {
    const env = validateEnv({
      ...base,
      AUTH_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----',
    });
    expect(env.AUTH_PUBLIC_KEY).toContain('\n');
  });
});