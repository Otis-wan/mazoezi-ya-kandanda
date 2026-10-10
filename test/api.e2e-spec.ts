import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

describe('API base (e2e)', () => {
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

  it('answers /health/live', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('checks the database on /health/ready', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  it('returns the error format with a request id', async () => {
    const res = await request(app.getHttpServer()).get('/v1/nothing').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, path: '/v1/nothing' });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('keeps a safe request id from the caller', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'abc-123');
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('allows the main site origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', 'https://tms.tisini.africa');
    expect(res.headers['access-control-allow-origin']).toBe('https://tms.tisini.africa');
  });

  it('blocks other origins', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('sets safe headers', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the API document', async () => {
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    expect(res.body.info.title).toBe('Training & Development API');
  });
});