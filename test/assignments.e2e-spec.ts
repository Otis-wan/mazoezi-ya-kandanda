import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { makeApp, ROLE_ID, token } from './helpers.js';

const P = 'e2e-as-';
const future = (days = 3) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

describe('Assignments, hand-ins and reviews (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let teamA: string; // ids in the main site's number style
  let admin: string;
  let coachA: string; // manages team A
  let coachB: string; // manages another team
  let kid1: string;
  let kid2: string; // same team, other player
  let outsider: string; // player on team B
  let routineId: string;
  let archivedRoutineId: string;
  let otherCoachRoutineId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await makeApp();
    prisma = app.get(PrismaService);
    admin = `Bearer ${await token({ sub: `${P}admin`, role: ROLE_ID.admin })}`;
    coachA = `Bearer ${await token({ sub: `${P}coachA`, role: ROLE_ID.manager, teams: [9001] })}`;
    coachB = `Bearer ${await token({ sub: `${P}coachB`, role: ROLE_ID.manager, teams: [9002] })}`;
    kid1 = `Bearer ${await token({ sub: `${P}kid1`, role: ROLE_ID.player })}`;
    kid2 = `Bearer ${await token({ sub: `${P}kid2`, role: ROLE_ID.player })}`;
    outsider = `Bearer ${await token({ sub: `${P}kid3`, role: ROLE_ID.player })}`;

    // The team ID a manager's token holds is a number as text, so name teams that way.
    teamA = '9001';
    const teamB = '9002';
    await prisma.team.upsert({
      where: { externalId: teamA },
      update: {},
      create: { externalId: teamA, name: 'E2E A', ageBand: 'AGE_13_14' },
    });
    await prisma.team.upsert({
      where: { externalId: teamB },
      update: {},
      create: { externalId: teamB, name: 'E2E B', ageBand: 'AGE_13_14' },
    });
    const tA = await prisma.team.findUniqueOrThrow({
      where: { externalId: teamA },
    });
    const tB = await prisma.team.findUniqueOrThrow({
      where: { externalId: teamB },
    });
    const mk = (n: string, teamId: string | null, isActive = true) =>
      prisma.player.create({
        data: {
          externalId: `${P}${n}`,
          firstName: n,
          lastName: 'T',
          birthYear: 2011,
          teamId,
          isActive,
        },
      });
    await mk('kid1', tA.id);
    await mk('kid2', tA.id);
    await mk('kid3', tB.id);
    await mk('loner', null);
    await mk('retired', tA.id, false);

    const mkRoutine = async (by: string, extra: object = {}) =>
      (
        await http()
          .post('/v1/routines')
          .set(
            'Authorization',
            `Bearer ${await token({ sub: by, role: ROLE_ID.manager, teams: [9001] })}`,
          )
          .send({
            name: 'E2E routine',
            drillIds: ['bm-001', 'bm-002'],
            ...extra,
          })
          .expect(201)
      ).body.id as string;
    routineId = await mkRoutine(`${P}coachA`);
    otherCoachRoutineId = await mkRoutine(`${P}someone-else`);
    archivedRoutineId = await mkRoutine(`${P}coachA`);
    await http()
      .patch(`/v1/routines/${archivedRoutineId}`)
      .set('Authorization', coachA)
      .send({ isArchived: true })
      .expect(200);
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({
      where: { player: { externalId: { startsWith: P } } },
    });
    await prisma.routine.deleteMany({
      where: { createdByExternalId: { startsWith: P } },
    });
    await prisma.player.deleteMany({
      where: { externalId: { startsWith: P } },
    });
    await prisma.team.deleteMany({
      where: { externalId: { in: ['9001', '9002'] } },
    });
    await app?.close();
  });

  const assign = (auth: string, body: object = {}) =>
    http()
      .post('/v1/assignments')
      .set('Authorization', auth)
      .send({
        routineId,
        playerExternalIds: [`${P}kid1`],
        dueAt: future(),
        ...body,
      });

  async function newAssignment(
    players: string[] = [`${P}kid1`],
    body: object = {},
  ) {
    const res = await assign(coachA, {
      playerExternalIds: players,
      ...body,
    }).expect(201);
    return res.body.data as { id: string }[];
  }

  // ---------- creating ----------

  it('blocks players from creating assignments', async () => {
    await assign(kid1).expect(403);
  });

  it('assigns one routine to several players at once', async () => {
    const res = await assign(coachA, {
      playerExternalIds: [`${P}kid1`, `${P}kid2`],
      note: ' go ',
    }).expect(201);
    expect(res.body.data).toHaveLength(2);
    const a = res.body.data[0];
    expect(a).toMatchObject({
      status: 'pending',
      isOverdue: false,
      recurrence: 'once',
      note: 'go',
      coachExternalId: `${P}coachA`,
    });
    expect(a.routine.drillCount).toBe(2);
    expect(a.player.teamExternalId).toBe(teamA);
  });

  it('refuses players the coach does not manage', async () => {
    const res = await assign(coachA, {
      playerExternalIds: [`${P}kid1`, `${P}kid3`],
    }).expect(403);
    expect(res.body.message).toContain(`${P}kid3`);
    await assign(coachA, { playerExternalIds: [`${P}loner`] }).expect(403);
    // Nothing was made for kid1 in the failed call.
    const mine = await http()
      .get('/v1/assignments?playerExternalId=' + `${P}kid3`)
      .set('Authorization', admin)
      .expect(200);
    expect(mine.body.meta.total).toBe(0);
  });

  it('lets an admin assign a player with no team', async () => {
    await assign(admin, { playerExternalIds: [`${P}loner`] }).expect(201);
  });

  it('refuses unknown or inactive players', async () => {
    await assign(coachA, { playerExternalIds: [`${P}ghost`] }).expect(400);
    const res = await assign(coachA, {
      playerExternalIds: [`${P}retired`],
    }).expect(400);
    expect(res.body.message).toContain('not active');
  });

  it("refuses a routine that is archived, missing or another coach's", async () => {
    await assign(coachA, { routineId: archivedRoutineId }).expect(400);
    await assign(coachA, {
      routineId: '00000000-0000-4000-8000-000000000000',
    }).expect(404);
    await assign(coachA, { routineId: otherCoachRoutineId }).expect(404);
    await assign(admin, { routineId: otherCoachRoutineId }).expect(201);
  });

  it('refuses a due time in the past or too far away', async () => {
    await assign(coachA, {
      dueAt: new Date(Date.now() - 60_000).toISOString(),
    }).expect(400);
    await assign(coachA, { dueAt: future(500) }).expect(400);
    await assign(coachA, { dueAt: 'tomorrow' }).expect(400);
  });

  it('refuses bad input', async () => {
    await assign(coachA, { playerExternalIds: [] }).expect(400);
    await assign(coachA, { recurrence: 'hourly' }).expect(400);
    await assign(coachA, { coachExternalId: 'me' }).expect(400);
  });

  // ---------- reading ----------

  it("scopes lists to the coach's teams", async () => {
    const [a] = await newAssignment();
    const ids = async (auth: string, qs = '') =>
      (
        await http()
          .get(`/v1/assignments?limit=100${qs}`)
          .set('Authorization', auth)
          .expect(200)
      ).body.data.map((x: { id: string }) => x.id);
    expect(await ids(coachA)).toContain(a!.id);
    expect(await ids(coachB)).not.toContain(a!.id);
    expect(await ids(admin)).toContain(a!.id);
    expect(await ids(coachA, `&teamExternalId=${teamA}`)).toContain(a!.id);
    expect(await ids(coachA, '&teamExternalId=9002')).not.toContain(a!.id);
    expect(await ids(coachA, `&playerExternalId=${P}kid2`)).not.toContain(
      a!.id,
    );
    expect(await ids(coachA, '&status=reviewed')).not.toContain(a!.id);
  });

  it("keeps a coach out of another team's assignment", async () => {
    const [a] = await newAssignment();
    await http()
      .get(`/v1/assignments/${a!.id}`)
      .set('Authorization', coachB)
      .expect(404);
    await http()
      .patch(`/v1/assignments/${a!.id}`)
      .set('Authorization', coachB)
      .send({ note: 'x' })
      .expect(404);
    await http()
      .post(`/v1/assignments/${a!.id}/cancel`)
      .set('Authorization', coachB)
      .expect(404);
    await http()
      .put(`/v1/assignments/${a!.id}/review`)
      .set('Authorization', coachB)
      .send({ feedback: 'x' })
      .expect(404);
  });

  it("lists only a player's own work under /mine", async () => {
    const [a] = await newAssignment([`${P}kid1`]);
    const b = (await newAssignment([`${P}kid2`]))[0]!;
    const mine = await http()
      .get('/v1/assignments/mine?limit=100')
      .set('Authorization', kid1)
      .expect(200);
    const ids = mine.body.data.map((x: { id: string }) => x.id);
    expect(ids).toContain(a!.id);
    expect(ids).not.toContain(b.id);
    await http()
      .get('/v1/assignments/mine')
      .set('Authorization', coachA)
      .expect(403);
  });

  it("shows a player the full detail of their own work, and no one else's", async () => {
    const [a] = await newAssignment();
    const res = await http()
      .get(`/v1/assignments/${a!.id}`)
      .set('Authorization', kid1)
      .expect(200);
    expect(res.body.drills).toHaveLength(2);
    expect(res.body.drills[0].drill.rubric.length).toBeGreaterThan(0);
    expect(res.body.submission).toBeNull();
    expect(res.body.scores).toEqual([]);
    await http()
      .get(`/v1/assignments/${a!.id}`)
      .set('Authorization', kid2)
      .expect(404);
    await http()
      .get(`/v1/assignments/${a!.id}`)
      .set('Authorization', outsider)
      .expect(404);
    await http()
      .get('/v1/assignments/not-a-uuid')
      .set('Authorization', kid1)
      .expect(400);
  });

  it('flags late open work and filters it', async () => {
    const [a] = await newAssignment();
    await prisma.assignment.update({
      where: { id: a!.id },
      data: { dueAt: new Date(Date.now() - 3_600_000) },
    });
    const res = await http()
      .get('/v1/assignments?overdue=true&limit=100')
      .set('Authorization', coachA)
      .expect(200);
    const hit = res.body.data.find((x: { id: string }) => x.id === a!.id);
    expect(hit.isOverdue).toBe(true);
    for (const x of res.body.data)
      expect(['pending', 'in_progress']).toContain(x.status);
  });

  // ---------- the work flow ----------

  const drill1 = () =>
    http()
      .get('/v1/drills/bm-001')
      .set('Authorization', coachA)
      .then((r) => r.body.rubric as { criterion: string }[]);

  it('runs the whole path: start, hand in, review, edit review', async () => {
    const [a] = await newAssignment();
    const id = a!.id;
    const rubric = await drill1();
    const c0 = rubric[0]!.criterion;
    const c1 = rubric[1]!.criterion;

    // start
    const started = await http()
      .post(`/v1/assignments/${id}/start`)
      .set('Authorization', kid1)
      .expect(200);
    expect(started.body.status).toBe('in_progress');
    await http()
      .post(`/v1/assignments/${id}/start`)
      .set('Authorization', kid1)
      .expect(200); // same again is fine
    await http()
      .post(`/v1/assignments/${id}/start`)
      .set('Authorization', coachA)
      .expect(403);

    // the coach cannot review before the player hands in
    const early = await http()
      .put(`/v1/assignments/${id}/review`)
      .set('Authorization', coachA)
      .send({ feedback: 'hi' })
      .expect(409);
    expect(early.body.message).toContain('not handed this in');

    // hand in
    const sub = await http()
      .put(`/v1/assignments/${id}/submission`)
      .set('Authorization', kid1)
      .send({
        selfFeedback: ' Felt good ',
        videoPlaybackId: 'abc123_XYZ-9',
        scores: [
          { drillId: 'bm-001', criterion: c0, score: 4 },
          { drillId: 'bm-001', criterion: c1, score: 2 },
        ],
      })
      .expect(200);
    expect(sub.body.status).toBe('submitted');
    expect(sub.body.submission).toMatchObject({
      selfFeedback: 'Felt good',
      videoPlaybackId: 'abc123_XYZ-9',
    });
    expect(sub.body.scores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          drillId: 'bm-001',
          criterion: c0,
          self: 4,
          coach: null,
        }),
        expect.objectContaining({
          drillId: 'bm-001',
          criterion: c1,
          self: 2,
          coach: null,
        }),
      ]),
    );

    // hand in again: replaces the first version
    const again = await http()
      .put(`/v1/assignments/${id}/submission`)
      .set('Authorization', kid1)
      .send({ scores: [{ drillId: 'bm-001', criterion: c0, score: 5 }] })
      .expect(200);
    expect(again.body.scores).toHaveLength(1);
    expect(again.body.scores[0]).toMatchObject({ self: 5 });
    expect(again.body.submission.selfFeedback).toBeNull();

    // the coach cannot send a hand-in, and another player cannot
    await http()
      .put(`/v1/assignments/${id}/submission`)
      .set('Authorization', coachA)
      .send({})
      .expect(403);
    await http()
      .put(`/v1/assignments/${id}/submission`)
      .set('Authorization', kid2)
      .send({})
      .expect(404);

    // review
    const rev = await http()
      .put(`/v1/assignments/${id}/review`)
      .set('Authorization', coachA)
      .send({
        feedback: 'Keep your head up',
        scores: [{ drillId: 'bm-001', criterion: c0, score: 3 }],
      })
      .expect(200);
    expect(rev.body.status).toBe('reviewed');
    expect(rev.body.review).toMatchObject({
      reviewerExternalId: `${P}coachA`,
      feedback: 'Keep your head up',
    });
    expect(rev.body.scores).toEqual([
      expect.objectContaining({ criterion: c0, self: 5, coach: 3 }),
    ]);

    // the player can no longer change the hand-in
    await http()
      .put(`/v1/assignments/${id}/submission`)
      .set('Authorization', kid1)
      .send({})
      .expect(409);

    // the coach can change the review, even as another manager of the team
    const edit = await http()
      .put(`/v1/assignments/${id}/review`)
      .set('Authorization', admin)
      .send({
        feedback: 'Updated',
        scores: [{ drillId: 'bm-001', criterion: c1, score: 4 }],
      })
      .expect(200);
    expect(edit.body.review.feedback).toBe('Updated');
    expect(edit.body.scores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ criterion: c0, self: 5, coach: null }),
        expect.objectContaining({ criterion: c1, self: null, coach: 4 }),
      ]),
    );
    expect(await prisma.review.count({ where: { assignmentId: id } })).toBe(1);

    // closed work cannot be changed or cancelled
    await http()
      .patch(`/v1/assignments/${id}`)
      .set('Authorization', coachA)
      .send({ note: 'x' })
      .expect(409);
    await http()
      .post(`/v1/assignments/${id}/cancel`)
      .set('Authorization', coachA)
      .expect(409);
  });

  it('refuses scores that do not fit the routine', async () => {
    const [a] = await newAssignment();
    const put = (body: object) =>
      http()
        .put(`/v1/assignments/${a!.id}/submission`)
        .set('Authorization', kid1)
        .send(body);
    const rubric = await drill1();
    const c0 = rubric[0]!.criterion;
    await put({
      scores: [{ drillId: 'sh-001', criterion: c0, score: 3 }],
    }).expect(400);
    await put({
      scores: [{ drillId: 'bm-001', criterion: 'Not a criterion', score: 3 }],
    }).expect(400);
    await put({
      scores: [{ drillId: 'bm-001', criterion: c0, score: 6 }],
    }).expect(400);
    await put({
      scores: [{ drillId: 'bm-001', criterion: c0, score: 0 }],
    }).expect(400);
    await put({
      scores: [{ drillId: 'bm-001', criterion: c0, score: 2.5 }],
    }).expect(400);
    await put({
      scores: [
        { drillId: 'bm-001', criterion: c0, score: 2 },
        { drillId: 'bm-001', criterion: c0, score: 3 },
      ],
    }).expect(400);
    await put({ videoPlaybackId: 'has spaces!' }).expect(400);
    await put({ extra: 1 }).expect(400);
    // Nothing changed.
    const now = await http()
      .get(`/v1/assignments/${a!.id}`)
      .set('Authorization', kid1)
      .expect(200);
    expect(now.body.status).toBe('pending');
  });

  it('needs something in a review', async () => {
    const [a] = await newAssignment();
    await http()
      .put(`/v1/assignments/${a!.id}/submission`)
      .set('Authorization', kid1)
      .send({})
      .expect(200);
    await http()
      .put(`/v1/assignments/${a!.id}/review`)
      .set('Authorization', coachA)
      .send({})
      .expect(400);
  });

  it('lets a player hand in straight from pending', async () => {
    const [a] = await newAssignment();
    const res = await http()
      .put(`/v1/assignments/${a!.id}/submission`)
      .set('Authorization', kid1)
      .send({ selfFeedback: 'done' })
      .expect(200);
    expect(res.body.status).toBe('submitted');
  });

  it('changes the due time and note of open work', async () => {
    const [a] = await newAssignment([`${P}kid1`], { note: 'first' });
    const due = future(10);
    const res = await http()
      .patch(`/v1/assignments/${a!.id}`)
      .set('Authorization', coachA)
      .send({ dueAt: due, note: '' })
      .expect(200);
    expect(new Date(res.body.dueAt).toISOString()).toBe(due);
    expect(res.body.note).toBeNull();
    await http()
      .patch(`/v1/assignments/${a!.id}`)
      .set('Authorization', coachA)
      .send({ dueAt: new Date(Date.now() - 1000).toISOString() })
      .expect(400);
    await http()
      .patch(`/v1/assignments/${a!.id}`)
      .set('Authorization', kid1)
      .send({ note: 'x' })
      .expect(403);
  });

  it('cancels work, and a cancelled assignment is closed', async () => {
    const [a] = await newAssignment();
    const res = await http()
      .post(`/v1/assignments/${a!.id}/cancel`)
      .set('Authorization', coachA)
      .expect(200);
    expect(res.body.status).toBe('cancelled');
    await http()
      .put(`/v1/assignments/${a!.id}/submission`)
      .set('Authorization', kid1)
      .send({})
      .expect(409);
    await http()
      .post(`/v1/assignments/${a!.id}/start`)
      .set('Authorization', kid1)
      .expect(409);
    await http()
      .post(`/v1/assignments/${a!.id}/cancel`)
      .set('Authorization', coachA)
      .expect(409);
  });

  it('cancels handed-in work', async () => {
    const [a] = await newAssignment();
    await http()
      .put(`/v1/assignments/${a!.id}/submission`)
      .set('Authorization', kid1)
      .send({})
      .expect(200);
    await http()
      .post(`/v1/assignments/${a!.id}/cancel`)
      .set('Authorization', coachA)
      .expect(200);
  });
});
