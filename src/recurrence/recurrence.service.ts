import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { Recurrence } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const STEP_MS: Record<'DAILY' | 'WEEKLY', number> = {
  DAILY: DAY_MS,
  WEEKLY: 7 * DAY_MS,
};

/**
 * The first due time after `now` that sits a whole number of steps after
 * `dueAt`. If the job was down for days, missed cycles are skipped, not
 * made late.
 */
export function nextDueAt(
  dueAt: Date,
  recurrence: 'DAILY' | 'WEEKLY',
  now: Date,
): Date {
  const step = STEP_MS[recurrence];
  const gone = Math.max(0, now.getTime() - dueAt.getTime());
  const cycles = Math.floor(gone / step) + 1;
  return new Date(dueAt.getTime() + cycles * step);
}

@Injectable()
export class RecurrenceService {
  private readonly logger = new Logger(RecurrenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Makes the next assignment for each daily or weekly series whose latest
   * assignment is now past due. It is safe to run twice: a unique index on
   * (seriesId, dueAt) stops a second copy.
   *
   * A series stops when its latest assignment is cancelled, its routine is
   * archived or its player is inactive.
   *
   * Returns how many assignments it made.
   */
  async generateDue(now: Date = new Date(), batch = 500): Promise<number> {
    const due = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT a."id"
      FROM "Assignment" a
      WHERE a."seriesId" IS NOT NULL
        AND a."recurrence" <> 'ONCE'
        AND a."status" <> 'CANCELLED'
        AND a."dueAt" <= ${now}
        AND NOT EXISTS (
          SELECT 1 FROM "Assignment" later
          WHERE later."seriesId" = a."seriesId" AND later."dueAt" > a."dueAt"
        )
        AND EXISTS (
          SELECT 1 FROM "Routine" r WHERE r."id" = a."routineId" AND NOT r."isArchived"
        )
        AND EXISTS (
          SELECT 1 FROM "Player" p WHERE p."id" = a."playerId" AND p."isActive"
        )
      ORDER BY a."dueAt" ASC
      LIMIT ${batch}
    `;
    if (due.length === 0) return 0;

    const rows = await this.prisma.assignment.findMany({
      where: { id: { in: due.map((d) => d.id) } },
    });

    let made = 0;
    for (const row of rows) {
      if (row.recurrence === Recurrence.ONCE || !row.seriesId) continue;
      try {
        await this.prisma.assignment.create({
          data: {
            routineId: row.routineId,
            playerId: row.playerId,
            coachExternalId: row.coachExternalId,
            recurrence: row.recurrence,
            seriesId: row.seriesId,
            note: row.note,
            dueAt: nextDueAt(row.dueAt, row.recurrence, now),
          },
        });
        made++;
      } catch (err) {
        // Another run made it first. That is fine.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          continue;
        }
        this.logger.error(
          `Could not repeat assignment ${row.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    return made;
  }
}
