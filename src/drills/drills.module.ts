import { Module } from '@nestjs/common';
import { DrillsController } from './drills.controller.js';
import { DrillsService } from './drills.service.js';

@Module({
  controllers: [DrillsController],
  providers: [DrillsService],
})
export class DrillsModule {}
