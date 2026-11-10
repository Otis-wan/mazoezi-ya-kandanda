import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { toPage } from '../common/pagination.js';
import type { Prisma } from '../generated/prisma/client.js';
import type {
  AgeBand,
  DrillCategory,
  DrillFormat,
  DrillPosition,
  Intensity,
} from '../generated/prisma/enums.js';
import {
  codeToAgeBand,
  codeToEnum,
  DRILL_SUMMARY_SELECT,
  toDrillDetail,
  toDrillSummary,
} from './drill-codes.js';
import type { ListDrillsQueryDto } from './drills.dto.js';

@Injectable()
export class DrillsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListDrillsQueryDto) {
    const where = buildWhere(query);
    const [rows, total] = await Promise.all([
      this.prisma.drill.findMany({
        where,
        select: DRILL_SUMMARY_SELECT,
        orderBy: { id: 'asc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.drill.count({ where }),
    ]);
    return toPage(rows.map(toDrillSummary), total, query);
  }

  async get(id: string) {
    const drill = await this.prisma.drill.findUnique({ where: { id } });
    if (!drill) throw new NotFoundException(`No drill with id ${id}`);
    return toDrillDetail(drill);
  }

  /** Sets or clears the sample clip link of a drill. It is a link, never a file. */
  async setSampleVideo(drillId: string, url: string | null) {
    const done = await this.prisma.drill.updateMany({
      where: { id: drillId },
      data: { sampleVideoUrl: url },
    });
    if (done.count === 0) {
      throw new NotFoundException(`No drill with id ${drillId}`);
    }
    return { id: drillId, sampleVideoUrl: url };
  }
}

export function buildWhere(query: ListDrillsQueryDto): Prisma.DrillWhereInput {
  const where: Prisma.DrillWhereInput = {};
  if (query.category)
    where.category = codeToEnum<DrillCategory>(query.category);
  if (query.format) where.format = codeToEnum<DrillFormat>(query.format);
  if (query.intensity) where.intensity = codeToEnum<Intensity>(query.intensity);
  if (query.ageBand)
    where.ageBands = { has: codeToAgeBand(query.ageBand) as AgeBand };
  if (query.position) {
    where.positions = {
      hasSome: [codeToEnum<DrillPosition>(query.position), 'ALL'],
    };
  }
  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: 'insensitive' } },
      { subcategory: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  return where;
}
