import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { makeApp, ROLE_ID, token } from './helpers.js';

const P = 'e2e-pg-';
const future = (days = 3) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

describe('Progress (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let admin: string;
  let coach: string;
  let otherCoach: string;
  let ana: string;
  let ben: string;
  let assignmentId: string;
  let c0: string;
  let c1: string;

  const http = () => request(app.getHttpServer());
  const get = (path: string, auth: string) =>
    http().get(path).set('Authorization', auth);

  beforeAll(async () => {
    app = await makeApp();
    prisma = app.get(PrismaService);
    admin = `Bearer ${await token({ sub: `${P}admin`, role: ROLE_ID.admin })}`;
    coach = `Bearer ${await token({ sub: `${P}coach`, role: ROLE_ID.manager, teams: [9201] })}`;
    otherCoach = `Bearer ${await token({ sub: `${P}other`, role: ROLE_ID.manager, teams: [9202] })}`;
    ana = `Bearer ${await token({ sub: `${P}ana`, role: ROLE_ID.player })}`;
    ben = `Bearer ${await token({ sub: `${P}ben`, role: ROLE_ID.player })}`;

    const team = await prisma.team.upsert({
      where: { externalId: '9201' },
      update: {},
      create: { externalId: '9201', name: 'E2E PG', ageBand: 'AGE_15_16' },
    });
    for (const n of ['ana', 'ben']) {
      await prisma.player.create({
        data: {
          externalId: `${P}${n}`,
          firstName: n,
          lastName: n,
          birthYear: 2010,
          teamId: team.id,
        },
      });
    }

    const rubric = (await get('/v1/drills/bm-001', coach).expect(200)).body
      .rubric as { criterion: string }[];
    c0 = rubric[0]!.criterion;
    c1 = rubric[1]!.criterion;

    const routineId = (
      await http()
        .post('/v1/routines')
        .set('Authorization', coach)
        .send({ name: 'E2E pg', drillIds: ['bm-001'] })
        .expect(201)
    ).body.id as string;
    const make = async (due?: string) =>
      (
        await http()
          .post('/v1/assignments')
          .set('Authorization', coach)
          .send({
            routineId,
            playerExternalIds: [`${P}ana`],
            dueAt: due ?? future(),
          })
          .expect(201)
      ).body.data[0].id as string;
    assignmentId = await make();
    const late = await make();
    await prisma.assignment.update({
      where: { id: late },
      data: { dueAt: new Date(Date.now() - 3_600_000) },
    });

    await http()
      .put(`/v1/assignments/${assignmentId}/submission`)
      .set('Authorization', ana)
      .send({
        scores: [
          { drillId: 'bm-001', criterion: c0, score: 4 },
          { drillId: 'bm-001', criterion: c1, score: 2 },
        ],
      })
      .expect(200);
    await http()
      .put(`/v1/assignments/${assignmentId}/review`)
      .set('Authorization', coach)
      .send({
        scores: [
          { drillId: 'bm-001', criterion: c0, score: 5 },
          { drillId: 'bm-001', criterion: c1, score: 3 },
        ],
      })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({
      where: { player: { externalId: { startsWith: P } } },
    });
    await prisma.routine.deleteMany({
      where: { createdByExternalId: `${P}coach` },
    });
    await prisma.player.deleteMany({
      where: { externalId: { startsWith: P } },
    });
    await prisma.team.deleteMany({ where: { externalId: '9201' } });
    await app?.close();
  });

  it("shows a player's scores by category, weakest criteria first", async () => {
    const res = await get(`/v1/players/${P}ana/progress`, coach).expect(200);
    expect(res.body.player).toMatchObject({
      externalId: `${P}ana`,
      teamExternalId: '9201',
    });
    expect(res.body.period.interval).toBe('week');
    expect(res.body.truncated).toBe(false);
    expect(res.body.categories).toHaveLength(1);
    const cat = res.body.categories[0];
    expect(cat).toMatchObject({
      category: 'ball_mastery',
      coachAverage: 4,
      selfAverage: 3,
      coachCount: 2,
      selfCount: 2,
      selfGap: -1,
    });
    expect(cat.criteria.map((c: { criterion: string }) => c.criterion)).toEqual(
      [c1, c0],
    );
    expect(cat.criteria[0].coachAverage).toBe(3);
    expect(cat.trend).toHaveLength(1);
    expect(cat.trend[0].coachAverage).toBe(4);
    expect(res.body.overall.coachAverage).toBe(4);
  });

  it("counts the player's work, with overdue and the completion rate", async () => {
    const res = await get(`/v1/players/${P}ana/progress`, admin).expect(200);
    expect(res.body.assignments).toMatchObject({
      total: 2,
      reviewed: 1,
      pending: 1,
      overdue: 1,
      completionRate: 0.5,
    });
  });

  it('can group by month', async () => {
    const res = await get(
      `/v1/players/${P}ana/progress?interval=month`,
      coach,
    ).expect(200);
    expect(res.body.categories[0].trend[0].period).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("lets a player see their own progress and no one else's", async () => {
    await get(`/v1/players/${P}ana/progress`, ana).expect(200);
    await get(`/v1/players/${P}ana/progress`, ben).expect(404);
  });

  it("keeps another team's coach out", async () => {
    await get(`/v1/players/${P}ana/progress`, otherCoach).expect(404);
    await get('/v1/players/e2e-pg-nobody/progress', admin).expect(404);
  });

  it('gives an empty answer for a player with no scores', async () => {
    const res = await get(`/v1/players/${P}ben/progress`, coach).expect(200);
    expect(res.body.categories).toEqual([]);
    expect(res.body.overall.coachAverage).toBeNull();
    expect(res.body.assignments).toMatchObject({
      total: 0,
      completionRate: null,
    });
  });

  it('leaves out scores outside the period', async () => {
    const res = await get(
      `/v1/players/${P}ana/progress?from=2020-01-01&to=2020-02-01`,
      coach,
    ).expect(200);
    expect(res.body.categories).toEqual([]);
  });

  it('refuses a bad period or interval', async () => {
    await get(`/v1/players/${P}ana/progress?interval=day`, coach).expect(400);
    await get(
      `/v1/players/${P}ana/progress?from=2026-12-01&to=2026-11-01`,
      coach,
    ).expect(400);
    await get(
      `/v1/players/${P}ana/progress?from=2020-01-01&to=2026-01-01`,
      coach,
    ).expect(400);
    await get(`/v1/players/${P}ana/progress?from=soon`, coach).expect(400);
  });

  it('gives a coach one line per player on a team', async () => {
    const res = await get('/v1/teams/9201/progress', coach).expect(200);
    expect(res.body.team).toEqual({
      externalId: '9201',
      name: 'E2E PG',
      ageBand: '15-16',
    });
    const byId = Object.fromEntries(
      res.body.players.map((p: { externalId: string }) => [p.externalId, p]),
    );
    expect(byId[`${P}ana`]).toMatchObject({
      coachAverage: 4,
      selfAverage: 3,
      coachCount: 2,
      assignments: { total: 2, reviewed: 1, overdue: 1, completionRate: 0.5 },
    });
    expect(byId[`${P}ben`]).toMatchObject({
      coachAverage: null,
      assignments: { total: 0 },
    });
  });

  it('guards the team view', async () => {
    await get('/v1/teams/9201/progress', otherCoach).expect(404);
    await get('/v1/teams/9201/progress', admin).expect(200);
    await get('/v1/teams/9201/progress', ana).expect(403);
    await get('/v1/teams/nope/progress', admin).expect(404);
  });
});
