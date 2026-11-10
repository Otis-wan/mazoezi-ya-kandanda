import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';
import { WorkService } from './work.service.js';

@Module({
  controllers: [AssignmentsController],
  providers: [AssignmentsService, WorkService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
