import { generateKeyPairSync } from 'node:crypto';
import { validateEnv } from '../config/env.validation.js';
import { redisOptions } from './recurrence.scheduler.js';
import { nextDueAt } from './recurrence.service.js';

const D = (s: string) => new Date(s);

describe('nextDueAt', () => {
  const now = D('2026-11-10T12:00:00Z');

  it('adds one step when the last one just passed', () => {
    expect(nextDueAt(D('2026-11-10T10:00:00Z'), 'DAILY', now)).toEqual(
      D('2026-11-11T10:00:00Z'),
    );
    expect(nextDueAt(D('2026-11-10T10:00:00Z'), 'WEEKLY', now)).toEqual(
      D('2026-11-17T10:00:00Z'),
    );
  });

  it('skips cycles missed while the job was down', () => {
    expect(nextDueAt(D('2026-11-05T10:00:00Z'), 'DAILY', now)).toEqual(
      D('2026-11-11T10:00:00Z'),
    );
    expect(nextDueAt(D('2026-10-20T10:00:00Z'), 'WEEKLY', now)).toEqual(
      D('2026-11-17T10:00:00Z'),
    );
  });

  it('always lands after now, on the same time of day', () => {
    const next = nextDueAt(D('2026-11-10T12:00:00Z'), 'DAILY', now); // due exactly now
    expect(next).toEqual(D('2026-11-11T12:00:00Z'));
  });
});

describe('redisOptions', () => {
  it('reads host, port, password and database', () => {
    expect(
      redisOptions('redis://user:p%40ss@cache.example:6380/2'),
    ).toMatchObject({
      host: 'cache.example',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      db: 2,
    });
  });

  it('uses the default port and adds TLS for rediss', () => {
    const o = redisOptions('rediss://cache.example');
    expect(o).toMatchObject({ host: 'cache.example', port: 6379, tls: {} });
  });
});

describe('REDIS_URL setting', () => {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const base = {
    DATABASE_URL: 'postgresql://x:y@localhost:5432/z',
    AUTH_PUBLIC_KEY: publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString(),
  };

  it('may be left out or empty', () => {
    expect(validateEnv(base).REDIS_URL).toBeUndefined();
    expect(validateEnv({ ...base, REDIS_URL: '' }).REDIS_URL).toBeUndefined();
  });

  it('must look like a Redis URL', () => {
    expect(
      validateEnv({ ...base, REDIS_URL: 'redis://localhost:6379' }).REDIS_URL,
    ).toBe('redis://localhost:6379');
    expect(() => validateEnv({ ...base, REDIS_URL: 'localhost:6379' })).toThrow(
      'REDIS_URL',
    );
  });
});
