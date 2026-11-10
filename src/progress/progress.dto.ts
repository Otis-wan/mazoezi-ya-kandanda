import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional } from 'class-validator';
import type { Interval } from './progress.aggregate.js';

export class TeamProgressQueryDto {
  @ApiPropertyOptional({
    description:
      'Start of the period. Work counts if it was assigned in the period; scores count if they were given in it. Default: 90 days before "to".',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'End of the period. Default: now.' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

export class PlayerProgressQueryDto extends TeamProgressQueryDto {
  @ApiPropertyOptional({ enum: ['week', 'month'], default: 'week' })
  @IsOptional()
  @IsIn(['week', 'month'])
  interval: Interval = 'week';
}
