import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.js';
import {
  AGE_BAND_CODES,
  CATEGORY_CODES,
  FORMAT_CODES,
  INTENSITY_CODES,
  POSITION_CODES,
} from './drill-codes.js';

export class ListDrillsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CATEGORY_CODES })
  @IsOptional()
  @IsIn(CATEGORY_CODES)
  category?: string;

  @ApiPropertyOptional({ enum: AGE_BAND_CODES })
  @IsOptional()
  @IsIn(AGE_BAND_CODES)
  ageBand?: string;

  @ApiPropertyOptional({
    enum: POSITION_CODES,
    description: 'Also returns drills marked ALL.',
  })
  @IsOptional()
  @IsIn(POSITION_CODES)
  position?: string;

  @ApiPropertyOptional({ enum: FORMAT_CODES })
  @IsOptional()
  @IsIn(FORMAT_CODES)
  format?: string;

  @ApiPropertyOptional({ enum: INTENSITY_CODES })
  @IsOptional()
  @IsIn(INTENSITY_CODES)
  intensity?: string;

  @ApiPropertyOptional({
    description: 'Search name, subcategory and description.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  q?: string;
}
