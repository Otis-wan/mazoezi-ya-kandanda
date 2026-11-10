import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.js';
import { DRILL_ID } from '../drills/drill-codes.js';

const MAX_DRILLS_PER_ROUTINE = 30;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Trims and lower-cases each tag, and drops repeats. */
const normalizeTags = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : t)),
        ),
      ]
    : value;

export class CreateRoutineDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'Up to 10 tags.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Transform(normalizeTags)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @ApiProperty({
    type: [String],
    example: ['bm-001', 'pa-003'],
    description:
      'Drill IDs in the order they are done. A drill may appear twice.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DRILLS_PER_ROUTINE)
  @Matches(DRILL_ID, {
    each: true,
    message: 'each drill ID must look like "sh-008"',
  })
  drillIds!: string[];
}

export class UpdateRoutineDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Transform(normalizeTags)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'If sent, this list replaces the current drills and order.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DRILLS_PER_ROUTINE)
  @Matches(DRILL_ID, {
    each: true,
    message: 'each drill ID must look like "sh-008"',
  })
  drillIds?: string[];

  @ApiPropertyOptional({
    description: 'Archived routines drop out of the default list.',
  })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class ListRoutinesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search name and description.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(30)
  tag?: string;

  @ApiPropertyOptional({ enum: ['false', 'true', 'all'], default: 'false' })
  @IsOptional()
  @IsIn(['false', 'true', 'all'])
  archived: 'false' | 'true' | 'all' = 'false';
}
