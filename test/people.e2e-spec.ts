import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { makeApp, ROLE_ID, token } from './helpers.js';

describe('Player and team sync (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: string;
  let manager: string;

  beforeAll(async () => {
    app = await makeApp();
    prisma = app.get(PrismaService);
    admin = `Bearer ${await token({ sub: 'e2e-sync', role: ROLE_ID.admin })}`;
    manager = `Bearer ${await token({ sub: 'e2e-sync-m', role: ROLE_ID.manager, teams: [1] })}`;
  });

  afterAll(async () => {
    await prisma.player.deleteMany({
      where: { externalId: { startsWith: 'e2e-sync-' } },
    });
    await prisma.team.deleteMany({
      where: { externalId: { startsWith: 'e2e-sync-' } },
    });
    await app?.close();
  });

  const put = (path: string, auth: string, body: object) =>
    request(app.getHttpServer())
      .put(path)
      .set('Authorization', auth)
      .send(body);

  it('lets only admin roles sync', async () => {
    await put('/v1/teams/e2e-sync-t0', manager, {
      name: 'X',
      ageBand: '13-14',
    }).expect(403);
    await put('/v1/players/e2e-sync-p0', manager, {
      firstName: 'A',
      lastName: 'B',
      birthYear: 2011,
    }).expect(403);
  });

  it('creates then updates a team', async () => {
    const a = await put('/v1/teams/e2e-sync-t1', admin, {
      name: ' U14 Reds ',
      ageBand: '13-14',
    }).expect(200);
    expect(a.body).toEqual({
      externalId: 'e2e-sync-t1',
      name: 'U14 Reds',
      ageBand: '13-14',
    });
    const b = await put('/v1/teams/e2e-sync-t1', admin, {
      name: 'U16 Reds',
      ageBand: '15-16',
    }).expect(200);
    expect(b.body.ageBand).toBe('15-16');
    expect(
      await prisma.team.count({ where: { externalId: 'e2e-sync-t1' } }),
    ).toBe(1);
  });

  it('refuses a bad age band, a bad ID and a stray field', async () => {
    await put('/v1/teams/e2e-sync-t2', admin, {
      name: 'X',
      ageBand: '20-21',
    }).expect(400);
    await put('/v1/teams/bad%20id', admin, {
      name: 'X',
      ageBand: '13-14',
    }).expect(400);
    await put('/v1/teams/e2e-sync-t2', admin, {
      name: 'X',
      ageBand: '13-14',
      id: 'x',
    }).expect(400);
  });

  it('creates a player on a team, then moves and deactivates them', async () => {
    await put('/v1/teams/e2e-sync-t3', admin, {
      name: 'T3',
      ageBand: '13-14',
    }).expect(200);
    const a = await put('/v1/players/e2e-sync-p1', admin, {
      firstName: 'Ana',
      lastName: 'Okoth',
      birthYear: 2011,
      position: 'MF',
      teamExternalId: 'e2e-sync-t3',
    }).expect(200);
    expect(a.body).toMatchObject({
      teamExternalId: 'e2e-sync-t3',
      position: 'MF',
      isActive: true,
    });

    const b = await put('/v1/players/e2e-sync-p1', admin, {
      firstName: 'Ana',
      lastName: 'Okoth',
      birthYear: 2011,
      isActive: false,
    }).expect(200);
    expect(b.body).toMatchObject({
      teamExternalId: null,
      position: null,
      isActive: false,
    });
    expect(
      await prisma.player.count({ where: { externalId: 'e2e-sync-p1' } }),
    ).toBe(1);
  });

  it('refuses a player with an unknown team or a bad year', async () => {
    const res = await put('/v1/players/e2e-sync-p2', admin, {
      firstName: 'A',
      lastName: 'B',
      birthYear: 2011,
      teamExternalId: 'e2e-sync-nope',
    }).expect(400);
    expect(res.body.message).toContain('e2e-sync-nope');
    await put('/v1/players/e2e-sync-p2', admin, {
      firstName: 'A',
      lastName: 'B',
      birthYear: 1850,
    }).expect(400);
  });
});
