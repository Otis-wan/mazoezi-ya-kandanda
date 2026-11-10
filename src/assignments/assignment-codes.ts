import { AssignmentStatus, Recurrence } from '../generated/prisma/enums.js';

export const STATUS_CODES = Object.values(AssignmentStatus).map((v) =>
  v.toLowerCase(),
);
export const RECURRENCE_CODES = Object.values(Recurrence).map((v) =>
  v.toLowerCase(),
);

/** The player can still hand work in. */
export const OPEN_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.PENDING,
  AssignmentStatus.IN_PROGRESS,
];

/** The player may submit, or change a submission the coach has not reviewed. */
export const SUBMITTABLE_STATUSES: AssignmentStatus[] = [
  ...OPEN_STATUSES,
  AssignmentStatus.SUBMITTED,
];

/** The coach may review, or change a review. */
export const REVIEWABLE_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.SUBMITTED,
  AssignmentStatus.REVIEWED,
];

/** The coach may still cancel. */
export const CANCELLABLE_STATUSES: AssignmentStatus[] = [
  ...OPEN_STATUSES,
  AssignmentStatus.SUBMITTED,
];

export function isOverdue(
  status: AssignmentStatus,
  dueAt: Date,
  now: Date,
): boolean {
  return OPEN_STATUSES.includes(status) && dueAt.getTime() < now.getTime();
}
