import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EXTERNAL_ID } from '../common/external-id.pipe.js';
import { AGE_BAND_CODES } from '../drills/drill-codes.js';
import { Position } from '../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpsertTeamDto {
  @ApiProperty({ maxLength: 120 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: AGE_BAND_CODES })
  @IsIn(AGE_BAND_CODES)
  ageBand!: string;
}

export class UpsertPlayerDto {
  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiProperty({ example: 2011 })
  @IsInt()
  @Min(1980)
  @Max(2100)
  birthYear!: number;

  @ApiPropertyOptional({ enum: Object.values(Position) })
  @IsOptional()
  @IsIn(Object.values(Position))
  position?: Position;

  @ApiPropertyOptional({
    description: 'The main site ID of the team. Leave out for no team.',
  })
  @IsOptional()
  @IsString()
  @Matches(EXTERNAL_ID)
  teamExternalId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
