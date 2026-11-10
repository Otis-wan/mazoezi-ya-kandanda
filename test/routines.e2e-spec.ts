import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { makeApp, ROLE_ID, token } from './helpers.js';

describe('Routines (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let alice: string;
  let bob: string;
  let admin: string;
  let player: string;
  const created: string[] = [];

  beforeAll(async () => {
    app = await makeApp();
    prisma = app.get(PrismaService);
    alice = `Bearer ${await token({ sub: 'e2e-alice', role: ROLE_ID.manager, teams: [1] })}`;
    bob = `Bearer ${await token({ sub: 'e2e-bob', role: ROLE_ID.manager, teams: [2] })}`;
    admin = `Bearer ${await token({ sub: 'e2e-admin', role: ROLE_ID.admin })}`;
    player = `Bearer ${await token({ sub: 'e2e-player', role: ROLE_ID.player })}`;
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({
      where: { routineId: { in: created } },
    });
    await prisma.routine.deleteMany({
      where: {
        createdByExternalId: { in: ['e2e-alice', 'e2e-bob', 'e2e-admin'] },
      },
    });
    await app?.close();
  });

  const http = () => request(app.getHttpServer());

  async function make(auth: string, body: object = {}) {
    const res = await http()
      .post('/v1/routines')
      .set('Authorization', auth)
      .send({ name: 'Warm-up', drillIds: ['bm-001', 'bm-002'], ...body })
      .expect(201);
    created.push(res.body.id);
    return res.body;
  }

  it('warns when a routine holds more than one heading drill', async () => {
    const one = await make(alice, { drillIds: ['bm-001', 'he-001'] });
    expect(one.warnings).toEqual([]);
    const two = await make(alice, { drillIds: ['he-001', 'he-002'] });
    expect(two.warnings).toHaveLength(1);
    expect(two.warnings[0].code).toBe('HEADING_VOLUME');
    const read = await http()
      .get(`/v1/routines/${two.id}`)
      .set('Authorization', alice)
      .expect(200);
    expect(read.body.warnings).toHaveLength(1);
  });

  it('blocks a player', async () => {
    await http().get('/v1/routines').set('Authorization', player).expect(403);
  });

  it('creates a routine with ordered drills and a total time', async () => {
    const r = await make(alice, {
      name: '  Morning touch  ',
      tags: ['Touch', 'touch', 'warm-up'],
    });
    expect(r.name).toBe('Morning touch');
    expect(r.tags).toEqual(['touch', 'warm-up']);
    expect(r.createdByExternalId).toBe('e2e-alice');
    expect(r.drills.map((d: { order: number }) => d.order)).toEqual([1, 2]);
    expect(r.drills.map((d: { drill: { id: string } }) => d.drill.id)).toEqual([
      'bm-001',
      'bm-002',
    ]);
    expect(r.drillCount).toBe(2);
    expect(r.totalDurationMin).toBe(
      r.drills.reduce(
        (s: number, d: { drill: { durationMin: number } }) =>
          s + d.drill.durationMin,
        0,
      ),
    );
  });

  it('lets a drill appear twice', async () => {
    const r = await make(alice, { drillIds: ['bm-001', 'bm-002', 'bm-001'] });
    expect(r.drillCount).toBe(3);
  });

  it('refuses an unknown drill', async () => {
    const res = await http()
      .post('/v1/routines')
      .set('Authorization', alice)
      .send({ name: 'Bad', drillIds: ['bm-001', 'zz-999'] })
      .expect(400);
    expect(res.body.message).toContain('zz-999');
  });

  it('refuses an empty drill list, a bad ID and an extra field', async () => {
    const post = (body: object) =>
      http().post('/v1/routines').set('Authorization', alice).send(body);
    await post({ name: 'x', drillIds: [] }).expect(400);
    await post({ name: 'x', drillIds: ['nope'] }).expect(400);
    await post({ name: '   ', drillIds: ['bm-001'] }).expect(400);
    await post({
      name: 'x',
      drillIds: ['bm-001'],
      createdByExternalId: 'me',
    }).expect(400);
  });

  it('shows a manager only their own routines', async () => {
    const mine = await make(alice, { name: 'Alice only' });
    const res = await http()
      .get('/v1/routines?limit=100')
      .set('Authorization', bob)
      .expect(200);
    expect(res.body.data.map((r: { id: string }) => r.id)).not.toContain(
      mine.id,
    );
    await http()
      .get(`/v1/routines/${mine.id}`)
      .set('Authorization', bob)
      .expect(404);
    await http()
      .patch(`/v1/routines/${mine.id}`)
      .set('Authorization', bob)
      .send({ name: 'x' })
      .expect(404);
    await http()
      .delete(`/v1/routines/${mine.id}`)
      .set('Authorization', bob)
      .expect(404);
  });

  it('shows an admin every routine', async () => {
    const mine = await make(alice, { name: 'Admin can see' });
    await http()
      .get(`/v1/routines/${mine.id}`)
      .set('Authorization', admin)
      .expect(200);
    const res = await http()
      .get('/v1/routines?limit=100')
      .set('Authorization', admin)
      .expect(200);
    expect(res.body.data.map((r: { id: string }) => r.id)).toContain(mine.id);
  });

  it('rejects an ID that is not a UUID', async () => {
    await http()
      .get('/v1/routines/123')
      .set('Authorization', alice)
      .expect(400);
  });

  it('updates fields without touching the drills', async () => {
    const r = await make(alice);
    const res = await http()
      .patch(`/v1/routines/${r.id}`)
      .set('Authorization', alice)
      .send({ name: 'Renamed', description: 'Short one' })
      .expect(200);
    expect(res.body.name).toBe('Renamed');
    expect(res.body.description).toBe('Short one');
    expect(res.body.drillCount).toBe(2);
  });

  it('replaces and reorders the drills', async () => {
    const r = await make(alice);
    const res = await http()
      .patch(`/v1/routines/${r.id}`)
      .set('Authorization', alice)
      .send({ drillIds: ['bm-003', 'bm-001'] })
      .expect(200);
    expect(
      res.body.drills.map((d: { drill: { id: string } }) => d.drill.id),
    ).toEqual(['bm-003', 'bm-001']);
    expect(res.body.drills.map((d: { order: number }) => d.order)).toEqual([
      1, 2,
    ]);
  });

  it('keeps the old drills when the new list has an unknown ID', async () => {
    const r = await make(alice);
    await http()
      .patch(`/v1/routines/${r.id}`)
      .set('Authorization', alice)
      .send({ drillIds: ['zz-999'] })
      .expect(400);
    const res = await http()
      .get(`/v1/routines/${r.id}`)
      .set('Authorization', alice)
      .expect(200);
    expect(res.body.drillCount).toBe(2);
  });

  it('archives a routine and hides it from the default list', async () => {
    const r = await make(alice, { name: 'To archive' });
    await http()
      .patch(`/v1/routines/${r.id}`)
      .set('Authorization', alice)
      .send({ isArchived: true })
      .expect(200);
    const ids = async (qs: string) =>
      (
        await http()
          .get(`/v1/routines?limit=100${qs}`)
          .set('Authorization', alice)
          .expect(200)
      ).body.data.map((x: { id: string }) => x.id);
    expect(await ids('')).not.toContain(r.id);
    expect(await ids('&archived=true')).toContain(r.id);
    expect(await ids('&archived=all')).toContain(r.id);
  });

  it('filters by tag and text', async () => {
    const r = await make(alice, {
      name: 'Zebra crossing',
      tags: ['zebra-tag'],
    });
    const byTag = await http()
      .get('/v1/routines?tag=ZEBRA-TAG')
      .set('Authorization', alice)
      .expect(200);
    expect(byTag.body.data.map((x: { id: string }) => x.id)).toEqual([r.id]);
    const byText = await http()
      .get('/v1/routines?q=zebra')
      .set('Authorization', alice)
      .expect(200);
    expect(byText.body.data.map((x: { id: string }) => x.id)).toContain(r.id);
  });

  it('deletes a routine with no assignments', async () => {
    const r = await make(alice);
    await http()
      .delete(`/v1/routines/${r.id}`)
      .set('Authorization', alice)
      .expect(204);
    await http()
      .get(`/v1/routines/${r.id}`)
      .set('Authorization', alice)
      .expect(404);
  });

  it('refuses to delete a routine that has assignments', async () => {
    const r = await make(alice);
    const p = await prisma.player.create({
      data: {
        externalId: `e2e-p-${r.id}`,
        firstName: 'T',
        lastName: 'P',
        birthYear: 2010,
      },
    });
    await prisma.assignment.create({
      data: {
        routineId: r.id,
        playerId: p.id,
        coachExternalId: 'e2e-alice',
        dueAt: new Date(),
      },
    });
    const res = await http()
      .delete(`/v1/routines/${r.id}`)
      .set('Authorization', alice)
      .expect(409);
    expect(res.body.message).toContain('Archive');
    await prisma.assignment.deleteMany({ where: { routineId: r.id } });
    await prisma.player.delete({ where: { id: p.id } });
  });
});
