import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AssignmentStatus, ScoreSource } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  REVIEWABLE_STATUSES,
  SUBMITTABLE_STATUSES,
} from './assignment-codes.js';
import type { ReviewWorkDto, SubmitWorkDto } from './assignments.dto.js';
import { AssignmentsService } from './assignments.service.js';
import { checkScores, type ScoreInputDto } from './scores.js';

@Injectable()
export class WorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assignments: AssignmentsService,
  ) {}

  /**
   * The player hands in the work. Sending it again replaces the first
   * version, until the coach reviews it.
   */
  async submit(user: AuthUser, id: string, dto: SubmitWorkDto) {
    const row = await this.assignments.loadRow(user, id);
    if (!SUBMITTABLE_STATUSES.includes(row.status)) {
      throw new ConflictException(
        `You cannot hand in a ${row.status.toLowerCase()} assignment`,
      );
    }
    const scores = checkScores(row.routine.drills, dto.scores ?? []);

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.assignment.updateMany({
        where: { id, status: { in: SUBMITTABLE_STATUSES } },
        data: { status: AssignmentStatus.SUBMITTED },
      });
      if (moved.count === 0) {
        throw new ConflictException('The assignment just changed. Try again.');
      }
      const fields = {
        selfFeedback: dto.selfFeedback || null,
        videoPlaybackId: dto.videoPlaybackId ?? null,
      };
      await tx.submission.upsert({
        where: { assignmentId: id },
        create: { assignmentId: id, ...fields },
        update: { ...fields, submittedAt: new Date() },
      });
      await replaceScores(tx, id, ScoreSource.SELF, user.id, scores);
    });
    return this.assignments.get(user, id);
  }

  /** The coach reviews. Sending it again replaces the first review. */
  async review(user: AuthUser, id: string, dto: ReviewWorkDto) {
    const row = await this.assignments.loadRow(user, id);
    if (!REVIEWABLE_STATUSES.includes(row.status)) {
      throw new ConflictException(
        row.status === AssignmentStatus.PENDING ||
          row.status === AssignmentStatus.IN_PROGRESS
          ? 'The player has not handed this in yet'
          : `You cannot review a ${row.status.toLowerCase()} assignment`,
      );
    }
    const scores = checkScores(row.routine.drills, dto.scores ?? []);
    if (!dto.feedback && !dto.videoPlaybackId && scores.length === 0) {
      throw new BadRequestException(
        'Send feedback, a video or at least one score',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.assignment.updateMany({
        where: { id, status: { in: REVIEWABLE_STATUSES } },
        data: { status: AssignmentStatus.REVIEWED },
      });
      if (moved.count === 0) {
        throw new ConflictException('The assignment just changed. Try again.');
      }
      const fields = {
        reviewerExternalId: user.id,
        feedback: dto.feedback || null,
        videoPlaybackId: dto.videoPlaybackId ?? null,
      };
      await tx.review.upsert({
        where: { assignmentId: id },
        create: { assignmentId: id, ...fields },
        update: { ...fields, reviewedAt: new Date() },
      });
      await replaceScores(tx, id, ScoreSource.COACH, user.id, scores);
    });
    return this.assignments.get(user, id);
  }
}

async function replaceScores(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  source: ScoreSource,
  authorExternalId: string,
  scores: ScoreInputDto[],
): Promise<void> {
  await tx.scoreEntry.deleteMany({ where: { assignmentId, source } });
  if (scores.length === 0) return;
  await tx.scoreEntry.createMany({
    data: scores.map((s) => ({
      assignmentId,
      drillId: s.drillId,
      criterion: s.criterion,
      score: s.score,
      source,
      authorExternalId,
    })),
  });
}
