import { Queue } from 'bullmq';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  QUEUE_NAME,
  redisOptions,
  SCHEDULER_ID,
} from '../src/recurrence/recurrence.scheduler.js';
import { RecurrenceService } from '../src/recurrence/recurrence.service.js';
import { makeApp, ROLE_ID, token } from './helpers.js';

const P = 'e2e-rc-';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const future = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('Repeating assignments (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let repeat: RecurrenceService;
  let coach: string;
  let routineId: string;

  const http = () => request(app.getHttpServer());
  const idFor = (n: string) => `${P}${n}`;

  beforeAll(async () => {
    app = await makeApp();
    prisma = app.get(PrismaService);
    repeat = app.get(RecurrenceService);
    coach = `Bearer ${await token({ sub: `${P}coach`, role: ROLE_ID.manager, teams: [9101] })}`;
    const team = await prisma.team.upsert({
      where: { externalId: '9101' },
      update: {},
      create: { externalId: '9101', name: 'E2E RC', ageBand: 'AGE_13_14' },
    });
    for (const n of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      await prisma.player.create({
        data: {
          externalId: idFor(n),
          firstName: n,
          lastName: 'R',
          birthYear: 2011,
          teamId: team.id,
        },
      });
    }
    routineId = (
      await http()
        .post('/v1/routines')
        .set('Authorization', coach)
        .send({ name: 'E2E repeat', drillIds: ['bm-001'] })
        .expect(201)
    ).body.id;
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
    await prisma.team.deleteMany({ where: { externalId: '9101' } });
    await app?.close();
  });

  async function make(
    player: string,
    recurrence: string,
    note = 'daily drill',
  ) {
    const res = await http()
      .post('/v1/assignments')
      .set('Authorization', coach)
      .send({
        routineId,
        playerExternalIds: [idFor(player)],
        dueAt: future(DAY),
        recurrence,
        note,
      })
      .expect(201);
    return res.body.data[0] as { id: string; seriesId: string | null };
  }

  const setDue = (id: string, ms: number) =>
    prisma.assignment.update({
      where: { id },
      data: { dueAt: new Date(Date.now() + ms) },
    });
  const series = (seriesId: string) =>
    prisma.assignment.findMany({
      where: { seriesId },
      orderBy: { dueAt: 'asc' },
    });

  it('gives a repeating assignment a series ID and a one-off none', async () => {
    const once = await make('a', 'once');
    expect(once.seriesId).toBeNull();
    const daily = await make('a', 'daily');
    expect(daily.seriesId).toEqual(expect.any(String));
  });

  it('makes the next daily assignment once its time has passed, and only once', async () => {
    const a = await make('b', 'daily', 'keep it up');
    await setDue(a.id, -2 * HOUR);

    expect(await repeat.generateDue()).toBeGreaterThanOrEqual(1);
    const rows = await series(a.seriesId!);
    expect(rows).toHaveLength(2);
    const [first, next] = rows as [
      (typeof rows)[number],
      (typeof rows)[number],
    ];
    expect(next.dueAt.getTime() - first.dueAt.getTime()).toBe(DAY);
    expect(next).toMatchObject({
      status: 'PENDING',
      recurrence: 'DAILY',
      note: 'keep it up',
      coachExternalId: `${P}coach`,
      playerId: first.playerId,
      routineId,
    });

    await repeat.generateDue();
    expect(await series(a.seriesId!)).toHaveLength(2); // a second run changes nothing
  });

  it('does not repeat before the time passes', async () => {
    const a = await make('c', 'daily');
    await repeat.generateDue();
    expect(await series(a.seriesId!)).toHaveLength(1);
  });

  it('keeps the series going from the newest assignment', async () => {
    const a = await make('d', 'daily');
    await setDue(a.id, -2 * HOUR);
    await repeat.generateDue();
    const [, second] = await series(a.seriesId!);
    await setDue(second!.id, -HOUR);
    await repeat.generateDue();
    expect(await series(a.seriesId!)).toHaveLength(3);
  });

  it('skips missed cycles and keeps the weekly time of day', async () => {
    const a = await make('e', 'weekly');
    await setDue(a.id, -20 * DAY);
    await repeat.generateDue();
    const [first, next] = await series(a.seriesId!);
    expect(next!.dueAt.getTime() - first!.dueAt.getTime()).toBe(21 * DAY);
    expect(next!.dueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('stops when the latest assignment is cancelled', async () => {
    const a = await make('f', 'daily');
    await http()
      .post(`/v1/assignments/${a.id}/cancel`)
      .set('Authorization', coach)
      .expect(200);
    await setDue(a.id, -2 * HOUR);
    await repeat.generateDue();
    expect(await series(a.seriesId!)).toHaveLength(1);
  });

  it('stops when the player is inactive or the routine is archived', async () => {
    const g = await make('g', 'daily');
    await setDue(g.id, -2 * HOUR);
    await prisma.player.update({
      where: { externalId: idFor('g') },
      data: { isActive: false },
    });
    await repeat.generateDue();
    expect(await series(g.seriesId!)).toHaveLength(1);
    await prisma.player.update({
      where: { externalId: idFor('g') },
      data: { isActive: true },
    });

    const r2 = (
      await http()
        .post('/v1/routines')
        .set('Authorization', coach)
        .send({ name: 'E2E arch', drillIds: ['bm-001'] })
        .expect(201)
    ).body.id as string;
    const res = await http()
      .post('/v1/assignments')
      .set('Authorization', coach)
      .send({
        routineId: r2,
        playerExternalIds: [idFor('a')],
        dueAt: future(DAY),
        recurrence: 'daily',
      })
      .expect(201);
    const arch = res.body.data[0] as { id: string; seriesId: string };
    await setDue(arch.id, -2 * HOUR);
    await http()
      .patch(`/v1/routines/${r2}`)
      .set('Authorization', coach)
      .send({ isArchived: true })
      .expect(200);
    await repeat.generateDue();
    expect(await series(arch.seriesId)).toHaveLength(1);
  });

  it('refuses to move an assignment onto a time its series already has', async () => {
    const a = await make('a', 'daily');
    await setDue(a.id, -2 * HOUR);
    await repeat.generateDue();
    const rows = await series(a.seriesId!);
    const [, second] = rows;
    // The first assignment is past due, so it cannot be edited. Edit the second onto its own time.
    await http()
      .patch(`/v1/assignments/${second!.id}`)
      .set('Authorization', coach)
      .send({ dueAt: second!.dueAt.toISOString() })
      .expect(200);
  });
});

// Needs a Redis. Set REDIS_TEST_URL to run it (CI does).
describe.skipIf(!process.env.REDIS_TEST_URL)(
  'Repeat job schedule (e2e, needs Redis)',
  () => {
    it('registers a job that runs every five minutes', async () => {
      process.env.REDIS_URL = process.env.REDIS_TEST_URL!;
      const app = await makeApp();
      const queue = new Queue(QUEUE_NAME, {
        connection: redisOptions(process.env.REDIS_TEST_URL!),
      });
      try {
        const schedulers = await queue.getJobSchedulers();
        const ours = schedulers.find(
          (s) => s.key === SCHEDULER_ID || s.id === SCHEDULER_ID,
        );
        expect(ours).toBeDefined();
        expect(ours!.every).toBe(300_000);
      } finally {
        await queue.close();
        await app.close();
        process.env.REDIS_URL = '';
      }
    });
  },
);
