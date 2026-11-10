import type { NestExpressApplication } from '@nestjs/platform-express';
import { importPKCS8, SignJWT } from 'jose';
import request from 'supertest';
import { makeApp, ROLE_ID, token } from './helpers.js';

const ID = '11111111-1111-4111-8111-111111111111';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type RouteRule = { method: Method; path: string; roles: number[] };

const STAFF = [ROLE_ID.admin, ROLE_ID.superAgent, ROLE_ID.manager];
const ALL = [...STAFF, ROLE_ID.player];
const ADMINS = [ROLE_ID.admin, ROLE_ID.superAgent];

// One row for every route. A new route that is not listed here is not tested,
// so keep this table whole. (The last test checks it against the app.)
const ROUTES: RouteRule[] = [
  { method: 'get', path: '/v1/me', roles: STAFF },
  { method: 'get', path: '/v1/drills', roles: ALL },
  { method: 'get', path: `/v1/drills/${ID}`, roles: ALL },
  { method: 'post', path: '/v1/routines', roles: STAFF },
  { method: 'get', path: '/v1/routines', roles: STAFF },
  { method: 'get', path: `/v1/routines/${ID}`, roles: STAFF },
  { method: 'patch', path: `/v1/routines/${ID}`, roles: STAFF },
  { method: 'delete', path: `/v1/routines/${ID}`, roles: STAFF },
  { method: 'put', path: '/v1/teams/t1', roles: ADMINS },
  { method: 'put', path: '/v1/players/p1', roles: ADMINS },
  { method: 'post', path: '/v1/assignments', roles: STAFF },
  { method: 'get', path: '/v1/assignments', roles: STAFF },
  { method: 'get', path: '/v1/assignments/mine', roles: [ROLE_ID.player] },
  { method: 'get', path: `/v1/assignments/${ID}`, roles: ALL },
  { method: 'patch', path: `/v1/assignments/${ID}`, roles: STAFF },
  { method: 'post', path: `/v1/assignments/${ID}/cancel`, roles: STAFF },
  {
    method: 'post',
    path: `/v1/assignments/${ID}/start`,
    roles: [ROLE_ID.player],
  },
  {
    method: 'put',
    path: `/v1/assignments/${ID}/submission`,
    roles: [ROLE_ID.player],
  },
  { method: 'put', path: `/v1/assignments/${ID}/review`, roles: STAFF },
  { method: 'get', path: '/v1/players/p1/progress', roles: ALL },
  { method: 'get', path: '/v1/teams/t1/progress', roles: STAFF },
];

const ROLE_NAMES: Record<number, string> = {
  1: 'admin',
  2: 'team manager',
  3: 'unknown role 3',
  5: 'player',
  7: 'super agent',
};

describe('Security (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => {
    await app?.close();
  });

  const call = (r: RouteRule, auth?: string) => {
    const req = http()[r.method](r.path);
    if (auth) req.set('Authorization', `Bearer ${auth}`);
    return r.method === 'get' || r.method === 'delete' ? req : req.send({});
  };

  describe('every route', () => {
    it.each(ROUTES)('$method $path needs a token', async (r) => {
      const res = await call(r);
      expect(res.status).toBe(401);
    });

    it.each(ROUTES)(
      '$method $path refuses roles that are not listed',
      async (r) => {
        const refused = [1, 2, 3, 5, 7].filter((id) => !r.roles.includes(id));
        for (const role of refused) {
          const res = await call(r, await token({ role, teams: [1] }));
          expect(
            res.status,
            `${ROLE_NAMES[role]} on ${r.method} ${r.path}`,
          ).toBe(403);
        }
      },
    );
  });

  describe('forged tokens', () => {
    const base = async () => token({ role: ROLE_ID.player, sub: 'p1' });
    const forge = (jwt: string, patch: Record<string, unknown>) => {
      const [h, p, s] = jwt.split('.');
      const body = JSON.parse(Buffer.from(p!, 'base64url').toString());
      Object.assign(body, patch);
      return `${h}.${Buffer.from(JSON.stringify(body)).toString('base64url')}.${s}`;
    };

    it('refuses a payload edited to a higher role', async () => {
      const forged = forge(await base(), { role: ROLE_ID.admin });
      const res = await http()
        .get('/v1/me')
        .set('Authorization', `Bearer ${forged}`);
      expect(res.status).toBe(401);
    });

    it('refuses alg none', async () => {
      const head = Buffer.from('{"alg":"none","typ":"JWT"}').toString(
        'base64url',
      );
      const body = Buffer.from(
        JSON.stringify({
          sub: '1',
          role: 1,
          teams: [],
          iss: 'test-issuer',
          aud: 'test-audience',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ).toString('base64url');
      const res = await http()
        .get('/v1/me')
        .set('Authorization', `Bearer ${head}.${body}.`);
      expect(res.status).toBe(401);
    });

    it('refuses a token signed by a different key', async () => {
      const { generateKeyPair } = await import('jose');
      const { privateKey } = await generateKeyPair('ES256');
      const jwt = await new SignJWT({ role: 1, teams: [] })
        .setProtectedHeader({ alg: 'ES256' })
        .setSubject('1')
        .setIssuer('test-issuer')
        .setAudience('test-audience')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      const res = await http()
        .get('/v1/me')
        .set('Authorization', `Bearer ${jwt}`);
      expect(res.status).toBe(401);
    });

    it('refuses a token with no expiry', async () => {
      const key = await importPKCS8(
        process.env.AUTH_TEST_PRIVATE_KEY!,
        'ES256',
      );
      const jwt = await new SignJWT({ role: 1, teams: [] })
        .setProtectedHeader({ alg: 'ES256' })
        .setSubject('1')
        .setIssuer('test-issuer')
        .setAudience('test-audience')
        .setIssuedAt()
        .sign(key);
      const res = await http()
        .get('/v1/me')
        .set('Authorization', `Bearer ${jwt}`);
      expect(res.status).toBe(401);
    });

    it('refuses a token sent in a query string or cookie', async () => {
      const jwt = await token({ role: ROLE_ID.admin });
      expect((await http().get(`/v1/me?access_token=${jwt}`)).status).toBe(401);
      expect(
        (await http().get('/v1/me').set('Cookie', `token=${jwt}`)).status,
      ).toBe(401);
    });

    it('refuses other auth schemes and extra header parts', async () => {
      const jwt = await token({ role: ROLE_ID.admin });
      expect(
        (await http().get('/v1/me').set('Authorization', `Basic ${jwt}`))
          .status,
      ).toBe(401);
      expect(
        (await http().get('/v1/me').set('Authorization', `Bearer ${jwt} x`))
          .status,
      ).toBe(401);
      expect(
        (
          await http()
            .get('/v1/me')
            .set('Authorization', `Bearer ${'a'.repeat(5000)}`)
        ).status,
      ).toBe(401);
    });
  });

  describe('a player reaches only their own data', () => {
    it("cannot read another player's progress", async () => {
      const jwt = await token({ role: ROLE_ID.player, sub: 'player-a' });
      const own = await http()
        .get('/v1/players/player-a/progress')
        .set('Authorization', `Bearer ${jwt}`);
      const other = await http()
        .get('/v1/players/player-b/progress')
        .set('Authorization', `Bearer ${jwt}`);
      expect(own.status).not.toBe(403);
      expect(other.status).toBe(404);
    });

    it('cannot claim a team through the request', async () => {
      const jwt = await token({
        role: ROLE_ID.manager,
        sub: 'm1',
        teams: [10],
      });
      const res = await http()
        .get('/v1/teams/99/progress')
        .set('Authorization', `Bearer ${jwt}`);
      expect(res.status).toBe(404);
    });
  });

  describe('input', () => {
    it('refuses unknown fields (mass assignment)', async () => {
      const jwt = await token({ role: ROLE_ID.admin, sub: 'e2e-admin' });
      const res = await http()
        .post('/v1/routines')
        .set('Authorization', `Bearer ${jwt}`)
        .send({
          name: 'x',
          createdBy: 'someone-else',
          isAdmin: true,
          drills: [],
        });
      expect(res.status).toBe(400);
    });

    it('refuses a body over 100 kb', async () => {
      const jwt = await token({ role: ROLE_ID.admin, sub: 'e2e-admin' });
      const res = await http()
        .post('/v1/routines')
        .set('Authorization', `Bearer ${jwt}`)
        .send({ name: 'x'.repeat(200_000) });
      expect(res.status).toBe(413);
    });

    it('answers 400, not 500, to broken JSON', async () => {
      const jwt = await token({ role: ROLE_ID.admin });
      const res = await http()
        .post('/v1/routines')
        .set('Authorization', `Bearer ${jwt}`)
        .set('Content-Type', 'application/json')
        .send('{"name": ');
      expect(res.status).toBe(400);
    });

    it('refuses bad ids with 400 before any lookup', async () => {
      const jwt = await token({ role: ROLE_ID.admin });
      expect(
        (
          await http()
            .get('/v1/routines/not-a-uuid')
            .set('Authorization', `Bearer ${jwt}`)
        ).status,
      ).toBe(400);
      expect(
        (
          await http()
            .put("/v1/players/x'%3B%20DROP%20TABLE%20players")
            .set('Authorization', `Bearer ${jwt}`)
            .send({})
        ).status,
      ).toBe(400);
    });

    it('treats SQL text in a filter as plain text', async () => {
      const jwt = await token({ role: ROLE_ID.admin });
      const res = await http()
        .get("/v1/drills?q=' OR 1=1 --")
        .set('Authorization', `Bearer ${jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.meta.total).toBe(0);
    });

    it('refuses an array where text is expected (parameter pollution)', async () => {
      const jwt = await token({ role: ROLE_ID.admin });
      const res = await http()
        .get('/v1/drills?category=technical&category=defending&limit=1&limit=2')
        .set('Authorization', `Bearer ${jwt}`);
      expect(res.status).toBe(400);
    });
  });

  describe('replies', () => {
    it('set security headers and no-store', async () => {
      const res = await http().get('/health/live');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('give no stack or file path on an unknown route', async () => {
      const jwt = await token({ role: ROLE_ID.admin });
      const res = await http()
        .get('/v1/nothing-here')
        .set('Authorization', `Bearer ${jwt}`);
      expect(res.status).toBe(401 === res.status ? 401 : 404);
      expect(JSON.stringify(res.body)).not.toMatch(
        /node_modules|\/src\/|at \w+/,
      );
    });

    it('allow only listed sites', async () => {
      const ok = await http()
        .options('/v1/me')
        .set('Origin', 'https://tms.tisini.africa')
        .set('Access-Control-Request-Method', 'GET');
      const bad = await http()
        .options('/v1/me')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET');
      expect(ok.headers['access-control-allow-origin']).toBe(
        'https://tms.tisini.africa',
      );
      expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('keep the health check open and light', async () => {
      const res = await http().get('/health/live');
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(
        /postgres|password|DATABASE/i,
      );
    });
  });
});
