import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { importPKCS8, SignJWT } from 'jose';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

async function token(claims: { role?: number; teams?: number[] } = {}) {
  const key = await importPKCS8(process.env.AUTH_TEST_PRIVATE_KEY!, 'ES256');
  return new SignJWT({ role: claims.role ?? 2, teams: claims.teams ?? [10, 11] })
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject('42')
    .setIssuer('test-issuer')
    .setAudience('test-audience')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (auth?: string) => {
    const req = request(app.getHttpServer()).get('/v1/me');
    return auth ? req.set('Authorization', `Bearer ${auth}`) : req;
  };

  it('refuses a call with no token', async () => {
    const res = await get().expect(401);
    expect(res.body.statusCode).toBe(401);
  });

  it('refuses a garbage token', async () => {
    await get('not-a-token').expect(401);
  });

  it('refuses a role with no access (agent)', async () => {
    await get(await token({ role: 26 })).expect(403);
  });

  it('refuses a player on a staff route', async () => {
    await get(await token({ role: 5 })).expect(403);
  });

  it('lets a team manager in, with their teams', async () => {
    const res = await get(await token({ role: 2 })).expect(200);
    expect(res.body).toEqual({ id: '42', role: 'TEAM_MANAGER', teamIds: ['10', '11'] });
  });

  it('lets an admin in', async () => {
    const res = await get(await token({ role: 1, teams: [] })).expect(200);
    expect(res.body.role).toBe('ADMIN');
  });

  it('keeps the health check public', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });
});