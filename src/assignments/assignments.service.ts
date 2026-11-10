import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canViewPlayer, isStaffWide } from '../auth/access.js';
import type { AuthUser } from '../auth/auth-user.js';
import { toPage, type PaginationQueryDto } from '../common/pagination.js';
import { toDrillDetail } from '../drills/drill-codes.js';
import { Prisma } from '../generated/prisma/client.js';
import { AssignmentStatus, Recurrence } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CANCELLABLE_STATUSES,
  isOverdue,
  OPEN_STATUSES,
} from './assignment-codes.js';
import type {
  CreateAssignmentsDto,
  ListAssignmentsQueryDto,
  ListMineQueryDto,
  UpdateAssignmentDto,
} from './assignments.dto.js';

const MAX_DAYS_AHEAD = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const PLAYER_SELECT = {
  externalId: true,
  firstName: true,
  lastName: true,
  isActive: true,
  team: { select: { externalId: true } },
} as const;

const LIST_INCLUDE = {
  routine: {
    select: {
      id: true,
      name: true,
      drills: { select: { drill: { select: { durationMin: true } } } },
    },
  },
  player: { select: PLAYER_SELECT },
} satisfies Prisma.AssignmentInclude;

const DETAIL_INCLUDE = {
  routine: {
    select: {
      id: true,
      name: true,
      drills: {
        orderBy: { order: 'asc' },
        select: { order: true, drill: true },
      },
    },
  },
  player: { select: PLAYER_SELECT },
  submission: true,
  review: true,
  scores: true,
} satisfies Prisma.AssignmentInclude;

export type DetailRow = Prisma.AssignmentGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

interface SummaryRow {
  id: string;
  status: AssignmentStatus;
  dueAt: Date;
  recurrence: Recurrence;
  seriesId: string | null;
  note: string | null;
  coachExternalId: string;
  createdAt: Date;
  updatedAt: Date;
  routine: {
    id: string;
    name: string;
    drills: { drill: { durationMin: number } }[];
  };
  player: {
    externalId: string;
    firstName: string;
    lastName: string;
    team: { externalId: string } | null;
  };
}

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, dto: CreateAssignmentsDto) {
    const now = new Date();
    assertDueDate(dto.dueAt, now);

    const routine = await this.prisma.routine.findUnique({
      where: { id: dto.routineId },
      select: { id: true, isArchived: true, createdByExternalId: true },
    });
    if (
      !routine ||
      (!isStaffWide(user) && routine.createdByExternalId !== user.id)
    ) {
      throw new NotFoundException('Routine not found');
    }
    if (routine.isArchived) {
      throw new BadRequestException(
        'This routine is archived. Restore it to assign it.',
      );
    }

    const players = await this.prisma.player.findMany({
      where: { externalId: { in: dto.playerExternalIds } },
      select: { id: true, ...PLAYER_SELECT },
    });
    const byExternal = new Map(players.map((p) => [p.externalId, p]));
    const unknown = dto.playerExternalIds.filter((id) => !byExternal.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown player: ${unknown.join(', ')}`);
    }
    const inactive = players
      .filter((p) => !p.isActive)
      .map((p) => p.externalId);
    if (inactive.length > 0) {
      throw new BadRequestException(
        `Player is not active: ${inactive.join(', ')}`,
      );
    }
    if (!isStaffWide(user)) {
      const denied = players
        .filter((p) => !p.team || !user.teamIds.includes(p.team.externalId))
        .map((p) => p.externalId);
      if (denied.length > 0) {
        throw new ForbiddenException(`You do not manage: ${denied.join(', ')}`);
      }
    }

    const recurrence = dto.recurrence
      ? (dto.recurrence.toUpperCase() as Recurrence)
      : Recurrence.ONCE;
    const rows = await this.prisma.$transaction(
      players.map((p) =>
        this.prisma.assignment.create({
          data: {
            routineId: routine.id,
            playerId: p.id,
            coachExternalId: user.id,
            dueAt: dto.dueAt,
            recurrence,
            seriesId: recurrence === Recurrence.ONCE ? null : randomUUID(),
            note: dto.note || null,
          },
          include: LIST_INCLUDE,
        }),
      ),
    );
    return { data: rows.map((r) => toSummary(r, now)) };
  }

  async list(user: AuthUser, query: ListAssignmentsQueryDto) {
    const now = new Date();
    const and: Prisma.AssignmentWhereInput[] = [];
    if (!isStaffWide(user)) {
      and.push({ player: { team: { externalId: { in: user.teamIds } } } });
    }
    if (query.playerExternalId)
      and.push({ player: { externalId: query.playerExternalId } });
    if (query.teamExternalId)
      and.push({ player: { team: { externalId: query.teamExternalId } } });
    if (query.routineId) and.push({ routineId: query.routineId });
    and.push(...statusFilters(query, now));
    return this.page({ AND: and }, query, now);
  }

  async listMine(user: AuthUser, query: ListMineQueryDto) {
    const now = new Date();
    const and: Prisma.AssignmentWhereInput[] = [
      { player: { externalId: user.id } },
      ...statusFilters(query, now),
    ];
    return this.page({ AND: and }, query, now);
  }

  async get(user: AuthUser, id: string) {
    return toDetail(await this.loadRow(user, id), new Date());
  }

  async update(user: AuthUser, id: string, dto: UpdateAssignmentDto) {
    const row = await this.loadRow(user, id);
    if (!OPEN_STATUSES.includes(row.status)) {
      throw new ConflictException(
        `You cannot change a ${row.status.toLowerCase()} assignment`,
      );
    }
    const data: Prisma.AssignmentUpdateInput = {};
    if (dto.dueAt !== undefined) {
      assertDueDate(dto.dueAt, new Date());
      data.dueAt = dto.dueAt;
    }
    if (dto.note !== undefined) data.note = dto.note || null;

    let moved: Prisma.BatchPayload;
    try {
      moved = await this.prisma.assignment.updateMany({
        where: { id, status: { in: OPEN_STATUSES } },
        data: data as Prisma.AssignmentUpdateManyMutationInput,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          'This series already has an assignment due at that time',
        );
      }
      throw err;
    }
    if (moved.count === 0)
      throw new ConflictException('The assignment just changed. Try again.');
    return this.get(user, id);
  }

  async cancel(user: AuthUser, id: string) {
    const row = await this.loadRow(user, id);
    if (!CANCELLABLE_STATUSES.includes(row.status)) {
      throw new ConflictException(
        `A ${row.status.toLowerCase()} assignment cannot be cancelled`,
      );
    }
    const moved = await this.prisma.assignment.updateMany({
      where: { id, status: { in: CANCELLABLE_STATUSES } },
      data: { status: AssignmentStatus.CANCELLED },
    });
    if (moved.count === 0)
      throw new ConflictException('The assignment just changed. Try again.');
    return this.get(user, id);
  }

  async start(user: AuthUser, id: string) {
    const row = await this.loadRow(user, id);
    if (row.status === AssignmentStatus.IN_PROGRESS)
      return toDetail(row, new Date());
    if (row.status !== AssignmentStatus.PENDING) {
      throw new ConflictException(
        `A ${row.status.toLowerCase()} assignment cannot be started`,
      );
    }
    const moved = await this.prisma.assignment.updateMany({
      where: { id, status: AssignmentStatus.PENDING },
      data: { status: AssignmentStatus.IN_PROGRESS },
    });
    if (moved.count === 0)
      throw new ConflictException('The assignment just changed. Try again.');
    return this.get(user, id);
  }

  /**
   * Loads one assignment the caller may see. A player sees their own. A team
   * manager sees those of players in their teams. Admins see all. Anything
   * else answers 404, so an ID tells an outsider nothing.
   */
  async loadRow(user: AuthUser, id: string): Promise<DetailRow> {
    const row = await this.prisma.assignment.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!row || !canViewPlayer(user, row.player))
      throw new NotFoundException('Assignment not found');
    return row;
  }

  private async page(
    where: Prisma.AssignmentWhereInput,
    query: PaginationQueryDto,
    now: Date,
  ) {
    const [rows, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.assignment.count({ where }),
    ]);
    return toPage(
      rows.map((r) => toSummary(r, now)),
      total,
      query,
    );
  }
}

function assertDueDate(dueAt: Date, now: Date): void {
  if (Number.isNaN(dueAt.getTime()))
    throw new BadRequestException('dueAt is not a date');
  if (dueAt.getTime() <= now.getTime()) {
    throw new BadRequestException('dueAt must be in the future');
  }
  if (dueAt.getTime() > now.getTime() + MAX_DAYS_AHEAD * DAY_MS) {
    throw new BadRequestException('dueAt is more than a year away');
  }
}

function statusFilters(
  query: { status?: string; overdue?: 'true' },
  now: Date,
): Prisma.AssignmentWhereInput[] {
  const out: Prisma.AssignmentWhereInput[] = [];
  if (query.status)
    out.push({ status: query.status.toUpperCase() as AssignmentStatus });
  if (query.overdue)
    out.push({ status: { in: OPEN_STATUSES }, dueAt: { lt: now } });
  return out;
}

function toSummary(r: SummaryRow, now: Date) {
  return {
    id: r.id,
    status: r.status.toLowerCase(),
    isOverdue: isOverdue(r.status, r.dueAt, now),
    dueAt: r.dueAt,
    recurrence: r.recurrence.toLowerCase(),
    seriesId: r.seriesId,
    note: r.note,
    coachExternalId: r.coachExternalId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    routine: {
      id: r.routine.id,
      name: r.routine.name,
      drillCount: r.routine.drills.length,
      totalDurationMin: r.routine.drills.reduce(
        (s, d) => s + d.drill.durationMin,
        0,
      ),
    },
    player: {
      externalId: r.player.externalId,
      firstName: r.player.firstName,
      lastName: r.player.lastName,
      teamExternalId: r.player.team?.externalId ?? null,
    },
  };
}

function toDetail(r: DetailRow, now: Date) {
  const scores = new Map<
    string,
    {
      drillId: string;
      criterion: string;
      self: number | null;
      coach: number | null;
    }
  >();
  for (const s of r.scores) {
    const key = `${s.drillId}\u0000${s.criterion}`;
    const entry = scores.get(key) ?? {
      drillId: s.drillId,
      criterion: s.criterion,
      self: null,
      coach: null,
    };
    if (s.source === 'SELF') entry.self = s.score;
    else entry.coach = s.score;
    scores.set(key, entry);
  }
  return {
    ...toSummary(r, now),
    drills: r.routine.drills.map((rd) => ({
      order: rd.order,
      drill: toDrillDetail(rd.drill),
    })),
    submission: r.submission && {
      submittedAt: r.submission.submittedAt,
      selfFeedback: r.submission.selfFeedback,
      videoPlaybackId: r.submission.videoPlaybackId,
    },
    review: r.review && {
      reviewerExternalId: r.review.reviewerExternalId,
      reviewedAt: r.review.reviewedAt,
      feedback: r.review.feedback,
      videoPlaybackId: r.review.videoPlaybackId,
    },
    scores: [...scores.values()].sort(
      (a, b) =>
        a.drillId.localeCompare(b.drillId) ||
        a.criterion.localeCompare(b.criterion),
    ),
  };
}
