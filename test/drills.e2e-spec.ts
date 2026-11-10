import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { makeApp, ROLE_ID, token } from './helpers.js';

describe('Drills (e2e)', () => {
  let app: NestExpressApplication;
  let auth: string;

  beforeAll(async () => {
    app = await makeApp();
    auth = `Bearer ${await token({ role: ROLE_ID.manager, teams: [10] })}`;
  });
  afterAll(async () => {
    await app?.close();
  });

  const get = (path: string, header: string | null = auth) => {
    const req = request(app.getHttpServer()).get(path);
    return header ? req.set('Authorization', header) : req;
  };

  it('needs a token', async () => {
    await get('/v1/drills', null).expect(401);
  });

  it('lets a player read drills', async () => {
    const player = `Bearer ${await token({ role: ROLE_ID.player })}`;
    await get('/v1/drills', player).expect(200);
  });

  it('pages the full library', async () => {
    const res = await get('/v1/drills?limit=100').expect(200);
    expect(res.body.meta).toMatchObject({
      total: 111,
      page: 1,
      limit: 100,
      totalPages: 2,
    });
    expect(res.body.data).toHaveLength(100);
    expect(res.body.data[0]).not.toHaveProperty('rubric');
    const second = await get('/v1/drills?limit=100&page=2').expect(200);
    expect(second.body.data).toHaveLength(11);
  });

  it('filters by category and age band', async () => {
    const res = await get('/v1/drills?category=heading&ageBand=13-14').expect(
      200,
    );
    expect(res.body.meta.total).toBe(4);
    for (const d of res.body.data) expect(d.ageBands).toContain('13-14');
    const res2 = await get('/v1/drills?category=heading&ageBand=17-19').expect(
      200,
    );
    expect(res2.body.meta.total).toBe(5);
    for (const d of res2.body.data) {
      expect(d.category).toBe('heading');
      expect(d.ageBands).toContain('17-19');
    }
  });

  it('includes drills for all positions when you filter by position', async () => {
    const res = await get('/v1/drills?position=GK&limit=100').expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const d of res.body.data) {
      expect(d.positions.some((p: string) => p === 'GK' || p === 'ALL')).toBe(
        true,
      );
    }
  });

  it('searches by text', async () => {
    const res = await get('/v1/drills?q=sole%20rolls').expect(200);
    expect(res.body.data.map((d: { id: string }) => d.id)).toContain('bm-001');
  });

  it('rejects a value that is not a category', async () => {
    await get('/v1/drills?category=cricket').expect(400);
  });

  it('rejects a filter it does not know', async () => {
    await get('/v1/drills?colour=red').expect(400);
  });

  it('returns one drill with its rubric and coaching points', async () => {
    const res = await get('/v1/drills/bm-001').expect(200);
    expect(res.body.id).toBe('bm-001');
    expect(res.body.category).toBe('ball_mastery');
    expect(Array.isArray(res.body.rubric)).toBe(true);
    expect(res.body.rubric.length).toBeGreaterThan(0);
    expect(res.body.coachingPoints.length).toBeGreaterThan(0);
  });

  it('answers 404 for a drill that does not exist', async () => {
    await get('/v1/drills/zz-999').expect(404);
  });
});
