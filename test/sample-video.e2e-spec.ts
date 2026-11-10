import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, ROLE_ID, token } from './helpers.js';

const CLIP = 'https://cdn.example.org/clips/bm-001.mp4';

describe('drill sample clip link', () => {
  let app: NestExpressApplication;
  let admin: string;
  let manager: string;
  let player: string;

  const put = (id: string, tok: string, body: unknown) =>
    request(app.getHttpServer())
      .put(`/v1/drills/${id}/sample-video`)
      .set('Authorization', `Bearer ${tok}`)
      .send(body as object);

  beforeAll(async () => {
    app = await makeApp();
    admin = await token({ role: ROLE_ID.admin });
    manager = await token({ sub: '900', role: ROLE_ID.manager, teams: [10] });
    player = await token({ sub: '101', role: ROLE_ID.player });
  });

  afterAll(async () => {
    await put('bm-001', admin, { url: null });
    await app.close();
  });

  it('lets an admin set a link, and a player reads it', async () => {
    const set = await put('bm-001', admin, { url: CLIP });
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ id: 'bm-001', sampleVideoUrl: CLIP });

    const read = await request(app.getHttpServer())
      .get('/v1/drills/bm-001')
      .set('Authorization', `Bearer ${player}`);
    expect(read.status).toBe(200);
    expect(read.body.sampleVideoUrl).toBe(CLIP);
  });

  it('refuses team managers and players', async () => {
    expect((await put('bm-001', manager, { url: CLIP })).status).toBe(403);
    expect((await put('bm-001', player, { url: CLIP })).status).toBe(403);
  });

  it('refuses a link that is not https', async () => {
    for (const url of [
      'http://cdn.example.org/a.mp4',
      'javascript:alert(1)',
      'not a link',
      '',
    ]) {
      expect((await put('bm-001', admin, { url })).status).toBe(400);
    }
    expect((await put('bm-001', admin, {})).status).toBe(400);
    expect((await put('bm-001', admin, { url: CLIP, extra: 1 })).status).toBe(
      400,
    );
  });

  it('answers 400 for a bad drill ID and 404 for an unknown drill', async () => {
    expect((await put('nope', admin, { url: CLIP })).status).toBe(400);
    expect((await put('zz-999', admin, { url: CLIP })).status).toBe(404);
  });

  it('clears the link with null', async () => {
    await put('bm-001', admin, { url: CLIP });
    const cleared = await put('bm-001', admin, { url: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.sampleVideoUrl).toBeNull();
  });
});
