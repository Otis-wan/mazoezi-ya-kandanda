import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AssignmentsModule } from './assignments/assignments.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { RolesGuard } from './auth/roles.guard.js';
import {
  AddressThrottlerGuard,
  throttleOptions,
  UserThrottlerGuard,
} from './common/throttling.js';
import { validateEnv, type Env } from './config/env.validation.js';
import { DrillsModule } from './drills/drills.module.js';
import { HealthModule } from './health/health.module.js';
import { PeopleModule } from './people/people.module.js';
import { ProgressModule } from './progress/progress.module.js';
import { RecurrenceModule } from './recurrence/recurrence.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RoutinesModule } from './routines/routines.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        throttleOptions({
          perAddress: config.get('RATE_LIMIT_PER_MINUTE', { infer: true }),
          perUser: config.get('RATE_LIMIT_USER_PER_MINUTE', { infer: true }),
          writesPerUser: config.get('RATE_LIMIT_WRITE_PER_MINUTE', {
            infer: true,
          }),
        }),
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    DrillsModule,
    RoutinesModule,
    PeopleModule,
    AssignmentsModule,
    RecurrenceModule,
    ProgressModule,
  ],
  providers: [
    // Order matters: address limit, who you are, user limit, what you may do.
    { provide: APP_GUARD, useClass: AddressThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
