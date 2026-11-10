import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isStaffWide } from '../auth/access.js';
import type { AuthUser } from '../auth/auth-user.js';
import { toPage } from '../common/pagination.js';
import {
  DRILL_SUMMARY_SELECT,
  toDrillSummary,
  type DrillSummaryRow,
} from '../drills/drill-codes.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { headingWarnings } from './heading.js';
import type {
  CreateRoutineDto,
  ListRoutinesQueryDto,
  UpdateRoutineDto,
} from './routines.dto.js';

const ROUTINE_INCLUDE = {
  drills: {
    orderBy: { order: 'asc' },
    select: { order: true, drill: { select: DRILL_SUMMARY_SELECT } },
  },
} satisfies Prisma.RoutineInclude;

type RoutineRow = Prisma.RoutineGetPayload<{ include: typeof ROUTINE_INCLUDE }>;

@Injectable()
export class RoutinesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateRoutineDto) {
    await this.assertDrillsExist(dto.drillIds);
    const routine = await this.prisma.routine.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        tags: dto.tags ?? [],
        createdByExternalId: user.id,
        drills: {
          create: dto.drillIds.map((drillId, i) => ({ drillId, order: i + 1 })),
        },
      },
      include: ROUTINE_INCLUDE,
    });
    return toRoutine(routine);
  }

  async list(user: AuthUser, query: ListRoutinesQueryDto) {
    const where: Prisma.RoutineWhereInput = {};
    if (!isStaffWide(user)) where.createdByExternalId = user.id;
    if (query.archived !== 'all') where.isArchived = query.archived === 'true';
    if (query.tag) where.tags = { has: query.tag };
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.routine.findMany({
        where,
        include: ROUTINE_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.routine.count({ where }),
    ]);
    return toPage(rows.map(toRoutine), total, query);
  }

  async get(user: AuthUser, id: string) {
    return toRoutine(await this.findVisible(user, id));
  }

  async update(user: AuthUser, id: string, dto: UpdateRoutineDto) {
    await this.findVisible(user, id);
    if (dto.drillIds) await this.assertDrillsExist(dto.drillIds);

    const data: Prisma.RoutineUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.isArchived !== undefined) data.isArchived = dto.isArchived;

    const routine = await this.prisma.$transaction(async (tx) => {
      if (dto.drillIds) {
        await tx.routineDrill.deleteMany({ where: { routineId: id } });
        await tx.routineDrill.createMany({
          data: dto.drillIds.map((drillId, i) => ({
            routineId: id,
            drillId,
            order: i + 1,
          })),
        });
      }
      return tx.routine.update({
        where: { id },
        data,
        include: ROUTINE_INCLUDE,
      });
    });
    return toRoutine(routine);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    await this.findVisible(user, id);
    const used = await this.prisma.assignment.count({
      where: { routineId: id },
    });
    if (used > 0) {
      throw new ConflictException(
        'This routine has assignments. Archive it instead of deleting it.',
      );
    }
    await this.prisma.routine.delete({ where: { id } });
  }

  /**
   * Staff-wide roles see every routine. A team manager sees only their own.
   * A routine that is hidden from you answers 404, not 403, so its ID leaks nothing.
   */
  private async findVisible(user: AuthUser, id: string): Promise<RoutineRow> {
    const routine = await this.prisma.routine.findUnique({
      where: { id },
      include: ROUTINE_INCLUDE,
    });
    if (!routine) throw new NotFoundException('Routine not found');
    if (!isStaffWide(user) && routine.createdByExternalId !== user.id) {
      throw new NotFoundException('Routine not found');
    }
    return routine;
  }

  private async assertDrillsExist(drillIds: string[]): Promise<void> {
    const wanted = [...new Set(drillIds)];
    const found = await this.prisma.drill.findMany({
      where: { id: { in: wanted } },
      select: { id: true },
    });
    const have = new Set(found.map((d) => d.id));
    const missing = wanted.filter((id) => !have.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(`Unknown drill ID: ${missing.join(', ')}`);
    }
  }
}

function toRoutine(r: RoutineRow) {
  const drills = r.drills.map((rd) => ({
    order: rd.order,
    drill: toDrillSummary(rd.drill as DrillSummaryRow),
  }));
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    tags: r.tags,
    isArchived: r.isArchived,
    createdByExternalId: r.createdByExternalId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    drillCount: drills.length,
    warnings: headingWarnings(drills.map((d) => d.drill)),
    totalDurationMin: drills.reduce((sum, d) => sum + d.drill.durationMin, 0),
    drills,
  };
}
