import { validateEnv } from './env.validation.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

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
});