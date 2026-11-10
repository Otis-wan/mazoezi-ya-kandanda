import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { EXTERNAL_ID } from '../common/external-id.pipe.js';
import { PaginationQueryDto } from '../common/pagination.js';
import { RECURRENCE_CODES, STATUS_CODES } from './assignment-codes.js';
import { MAX_SCORES, ScoreInputDto } from './scores.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const MAX_PLAYERS_PER_CALL = 100;

export class CreateAssignmentsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  routineId!: string;

  @ApiProperty({
    type: [String],
    description:
      'Main site IDs of the players. One assignment is made for each.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PLAYERS_PER_CALL)
  @Transform(({ value }) =>
    Array.isArray(value) ? [...new Set(value as unknown[])] : value,
  )
  @IsString({ each: true })
  @Matches(EXTERNAL_ID, { each: true })
  playerExternalIds!: string[];

  @ApiProperty({ example: '2026-11-01T18:00:00Z' })
  @Type(() => Date)
  @IsDate()
  dueAt!: Date;

  @ApiPropertyOptional({ enum: RECURRENCE_CODES, default: 'once' })
  @IsOptional()
  @IsIn(RECURRENCE_CODES)
  recurrence?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;

  @ApiPropertyOptional({
    maxLength: 1000,
    description: 'An empty string clears the note.',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ListMineQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STATUS_CODES })
  @IsOptional()
  @IsIn(STATUS_CODES)
  status?: string;

  @ApiPropertyOptional({
    description: 'Only pending or in-progress work past its due time.',
  })
  @IsOptional()
  @IsIn(['true'])
  overdue?: 'true';
}

export class ListAssignmentsQueryDto extends ListMineQueryDto {

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(EXTERNAL_ID)
  playerExternalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(EXTERNAL_ID)
  teamExternalId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  routineId?: string;
}

const VIDEO_ID = /^[A-Za-z0-9_-]{1,128}$/;

export class SubmitWorkDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  selfFeedback?: string;

  @ApiPropertyOptional({
    description: 'Playback ID from the video service. Never a file.',
  })
  @IsOptional()
  @IsString()
  @Matches(VIDEO_ID)
  videoPlaybackId?: string;

  @ApiPropertyOptional({
    type: [ScoreInputDto],
    description: 'Self scores. They replace earlier ones.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SCORES)
  @ValidateNested({ each: true })
  @Type(() => ScoreInputDto)
  scores?: ScoreInputDto[];
}

export class ReviewWorkDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  feedback?: string;

  @ApiPropertyOptional({
    description: 'Playback ID of a reply video. Never a file.',
  })
  @IsOptional()
  @IsString()
  @Matches(VIDEO_ID)
  videoPlaybackId?: string;

  @ApiPropertyOptional({
    type: [ScoreInputDto],
    description: 'Coach scores. They replace earlier ones.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SCORES)
  @ValidateNested({ each: true })
  @Type(() => ScoreInputDto)
  scores?: ScoreInputDto[];
}
