import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { DRILL_ID } from '../drills/drill-codes.js';

export const MAX_SCORES = 200;

export class ScoreInputDto {
  @ApiProperty({ example: 'bm-001' })
  @IsString()
  @Matches(DRILL_ID)
  drillId!: string;

  @ApiProperty({
    description: 'The criterion text, exactly as the drill rubric spells it.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  criterion!: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;
}

/** The criterion names in a drill's rubric. Bad data gives an empty list. */
export function criteriaOf(rubric: unknown): string[] {
  if (!Array.isArray(rubric)) return [];
  const out: string[] = [];
  for (const item of rubric) {
    const c = (item as { criterion?: unknown } | null)?.criterion;
    if (typeof c === 'string') out.push(c);
  }
  return out;
}

export interface RoutineDrillForScores {
  drill: { id: string; rubric: unknown };
}

/**
 * Checks each score against the routine. A score must name a drill that is in
 * the routine and a criterion that is in that drill's rubric, once only.
 */
export function checkScores(
  routineDrills: RoutineDrillForScores[],
  input: ScoreInputDto[],
): ScoreInputDto[] {
  const allowed = new Map<string, Set<string>>();
  for (const rd of routineDrills) {
    allowed.set(rd.drill.id, new Set(criteriaOf(rd.drill.rubric)));
  }

  const problems: string[] = [];
  const seen = new Set<string>();
  for (const s of input) {
    const criteria = allowed.get(s.drillId);
    if (!criteria) {
      problems.push(`${s.drillId} is not in this routine`);
    } else if (!criteria.has(s.criterion)) {
      problems.push(`"${s.criterion}" is not a criterion of ${s.drillId}`);
    }
    const key = `${s.drillId}\u0000${s.criterion}`;
    if (seen.has(key))
      problems.push(`Two scores for ${s.drillId} "${s.criterion}"`);
    seen.add(key);
  }
  if (problems.length > 0) throw new BadRequestException(problems);
  return input;
}
