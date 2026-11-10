import { Module } from '@nestjs/common';
import { RecurrenceScheduler } from './recurrence.scheduler.js';
import { RecurrenceService } from './recurrence.service.js';

@Module({
  providers: [RecurrenceService, RecurrenceScheduler],
  exports: [RecurrenceService],
})
export class RecurrenceModule {}
