import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canAccessTeam, canViewPlayer } from '../auth/access.js';
import type { AuthUser } from '../auth/auth-user.js';
import { OPEN_STATUSES } from '../assignments/assignment-codes.js';
import { ageBandToCode } from '../drills/drill-codes.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AssignmentStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  buildProgress,
  round2,
  Tally,
  type ScoreRow,
} from './progress.aggregate.js';
import type {
  PlayerProgressQueryDto,
  TeamProgressQueryDto,
} from './progress.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 90;
const MAX_DAYS = 366;
const MAX_SCORE_ROWS = 20_000;

interface Period {
  from: Date;
  to: Date;
}

export function resolvePeriod(query: TeamProgressQueryDto, now: Date): Period {
  const to = query.to ?? now;
  const from = query.from ?? new Date(to.getTime() - DEFAULT_DAYS * DAY_MS);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException('from and to must be dates');
  }
  if (from.getTime() >= to.getTime())
    throw new BadRequestException('"from" must be before "to"');
  if (to.getTime() - from.getTime() > MAX_DAYS * DAY_MS) {
    throw new BadRequestException(`The period can be at most ${MAX_DAYS} days`);
  }
  return { from, to };
}

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  /** Scores by category and week or month, plus counts of the player's work. */
  async player(
    user: AuthUser,
    externalId: string,
    query: PlayerProgressQueryDto,
  ) {
    const now = new Date();
    const { from, to } = resolvePeriod(query, now);

    const player = await this.prisma.player.findUnique({
      where: { externalId },
      select: {
        id: true,
        externalId: true,
        firstName: true,
        lastName: true,
        team: { select: { externalId: true } },
      },
    });
    if (!player || !canViewPlayer(user, player))
      throw new NotFoundException('Player not found');

    const inPeriod: Prisma.AssignmentWhereInput = {
      playerId: player.id,
      createdAt: { gte: from, lte: to },
    };
    const [scores, byStatus, overdue] = await Promise.all([
      this.prisma.scoreEntry.findMany({
        where: {
          assignment: { playerId: player.id },
          createdAt: { gte: from, lte: to },
        },
        select: {
          score: true,
          source: true,
          criterion: true,
          createdAt: true,
          drill: { select: { category: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: MAX_SCORE_ROWS + 1,
      }),
      this.prisma.assignment.groupBy({
        by: ['status'],
        where: inPeriod,
        _count: { _all: true },
      }),
      this.prisma.assignment.count({
        where: {
          ...inPeriod,
          status: { in: OPEN_STATUSES },
          dueAt: { lt: now },
        },
      }),
    ]);

    const truncated = scores.length > MAX_SCORE_ROWS;
    const rows: ScoreRow[] = scores.slice(0, MAX_SCORE_ROWS).map((s) => ({
      score: s.score,
      source: s.source,
      criterion: s.criterion,
      createdAt: s.createdAt,
      category: s.drill.category.toLowerCase(),
    }));

    const counts = Object.fromEntries(
      byStatus.map((g) => [g.status, g._count._all]),
    ) as Partial<Record<AssignmentStatus, number>>;
    return {
      player: {
        externalId: player.externalId,
        firstName: player.firstName,
        lastName: player.lastName,
        teamExternalId: player.team?.externalId ?? null,
      },
      period: { from, to, interval: query.interval },
      assignments: workCounts(counts, overdue),
      truncated,
      ...buildProgress(rows, query.interval),
    };
  }

  /** One line per active player on the team. */
  async team(
    user: AuthUser,
    teamExternalId: string,
    query: TeamProgressQueryDto,
  ) {
    const now = new Date();
    const { from, to } = resolvePeriod(query, now);

    const team = await this.prisma.team.findUnique({
      where: { externalId: teamExternalId },
    });
    if (!team || !canAccessTeam(user, team.externalId)) {
      throw new NotFoundException('Team not found');
    }

    const players = await this.prisma.player.findMany({
      where: { teamId: team.id, isActive: true },
      select: { id: true, externalId: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    const playerIds = players.map((p) => p.id);
    const inPeriod: Prisma.AssignmentWhereInput = {
      playerId: { in: playerIds },
      createdAt: { gte: from, lte: to },
    };

    const [scores, byStatus, late] = await Promise.all([
      this.prisma.scoreEntry.findMany({
        where: {
          assignment: { playerId: { in: playerIds } },
          createdAt: { gte: from, lte: to },
        },
        select: {
          score: true,
          source: true,
          assignment: { select: { playerId: true } },
        },
        take: MAX_SCORE_ROWS + 1,
      }),
      this.prisma.assignment.groupBy({
        by: ['playerId', 'status'],
        where: inPeriod,
        _count: { _all: true },
      }),
      this.prisma.assignment.groupBy({
        by: ['playerId'],
        where: {
          ...inPeriod,
          status: { in: OPEN_STATUSES },
          dueAt: { lt: now },
        },
        _count: { _all: true },
      }),
    ]);

    const tallies = new Map<string, Tally>();
    for (const s of scores.slice(0, MAX_SCORE_ROWS)) {
      const t = tallies.get(s.assignment.playerId) ?? new Tally();
      t.add(s.source, s.score);
      tallies.set(s.assignment.playerId, t);
    }
    const statusByPlayer = new Map<
      string,
      Partial<Record<AssignmentStatus, number>>
    >();
    for (const g of byStatus) {
      const m = statusByPlayer.get(g.playerId) ?? {};
      m[g.status] = g._count._all;
      statusByPlayer.set(g.playerId, m);
    }
    const lateByPlayer = new Map(late.map((g) => [g.playerId, g._count._all]));

    return {
      team: {
        externalId: team.externalId,
        name: team.name,
        ageBand: ageBandToCode(team.ageBand),
      },
      period: { from, to },
      truncated: scores.length > MAX_SCORE_ROWS,
      players: players.map((p) => ({
        externalId: p.externalId,
        firstName: p.firstName,
        lastName: p.lastName,
        assignments: workCounts(
          statusByPlayer.get(p.id) ?? {},
          lateByPlayer.get(p.id) ?? 0,
        ),
        ...(tallies.get(p.id) ?? new Tally()).result(),
      })),
    };
  }
}

/**
 * Cancelled work is left out of the total. The completion rate is the share
 * of work that was handed in, among work handed in or already late. Work that
 * is not due yet does not count against the player.
 */
export function workCounts(
  counts: Partial<Record<AssignmentStatus, number>>,
  overdue: number,
) {
  const n = (s: AssignmentStatus) => counts[s] ?? 0;
  const pending = n(AssignmentStatus.PENDING);
  const inProgress = n(AssignmentStatus.IN_PROGRESS);
  const submitted = n(AssignmentStatus.SUBMITTED);
  const reviewed = n(AssignmentStatus.REVIEWED);
  const total = pending + inProgress + submitted + reviewed;
  return {
    total,
    pending,
    inProgress,
    submitted,
    reviewed,
    cancelled: n(AssignmentStatus.CANCELLED),
    overdue,
    completionRate:
      submitted + reviewed + overdue > 0
        ? round2((submitted + reviewed) / (submitted + reviewed + overdue))
        : null,
  };
}
