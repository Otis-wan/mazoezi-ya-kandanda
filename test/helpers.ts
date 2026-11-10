import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { importPKCS8, SignJWT } from 'jose';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

export const ROLE_ID = {
  admin: 1,
  manager: 2,
  player: 5,
  superAgent: 7,
} as const;

export async function makeApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

/** A signed token, like the main site would send. */
export async function token(opts: {
  sub?: string;
  role: number;
  teams?: number[];
}): Promise<string> {
  const key = await importPKCS8(process.env.AUTH_TEST_PRIVATE_KEY!, 'ES256');
  return new SignJWT({ role: opts.role, teams: opts.teams ?? [] })
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject(opts.sub ?? '42')
    .setIssuer('test-issuer')
    .setAudience('test-audience')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}
