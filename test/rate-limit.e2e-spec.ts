import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { vi } from 'vitest';
import { makeApp, ROLE_ID, token } from './helpers.js';

// The app reads its settings when its file loads, so set the limits before that.
vi.hoisted(() => {
  Object.assign(process.env, {
    RATE_LIMIT_PER_MINUTE: '200',
    RATE_LIMIT_USER_PER_MINUTE: '5',
    RATE_LIMIT_WRITE_PER_MINUTE: '2',
  });
});

describe('Rate limits (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  it('stops one user and leaves another alone', async () => {
    const a = await token({ role: ROLE_ID.admin, sub: 'rl-a' });
    const b = await token({ role: ROLE_ID.admin, sub: 'rl-b' });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      codes.push(
        (await http().get('/v1/me').set('Authorization', `Bearer ${a}`)).status,
      );
    }
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes.slice(5)).toEqual([429, 429]);
    const other = await http()
      .get('/v1/me')
      .set('Authorization', `Bearer ${b}`);
    expect(other.status).toBe(200);
  });

  it('limits writes tighter than reads', async () => {
    const jwt = await token({ role: ROLE_ID.admin, sub: 'rl-w' });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      // A bad body is fine. The limit counts the call, not the result.
      codes.push(
        (
          await http()
            .post('/v1/routines')
            .set('Authorization', `Bearer ${jwt}`)
            .send({})
        ).status,
      );
    }
    expect(codes.slice(0, 2)).toEqual([400, 400]);
    expect(codes.slice(2)).toEqual([429, 429]);
  });

  it('sends Retry-After with a 429', async () => {
    const jwt = await token({ role: ROLE_ID.admin, sub: 'rl-r' });
    let last = await http().get('/v1/me').set('Authorization', `Bearer ${jwt}`);
    for (let i = 0; i < 6; i++) {
      last = await http().get('/v1/me').set('Authorization', `Bearer ${jwt}`);
    }
    expect(last.status).toBe(429);
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
  });
});
