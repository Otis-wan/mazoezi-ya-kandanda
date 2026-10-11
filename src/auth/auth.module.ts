import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { MeController } from './me.controller.js';
import { TokenVerifier } from './token-verifier.js';

@Module({
  controllers: [MeController],
  providers: [
    {
      provide: TokenVerifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        TokenVerifier.create({
          publicKeyPem: config.get('AUTH_PUBLIC_KEY', { infer: true }),
          issuer: config.get('AUTH_ISSUER', { infer: true }),
          audience: config.get('AUTH_AUDIENCE', { infer: true }),
        }),
    },
  ],
  exports: [TokenVerifier],
})
export class AuthModule {}