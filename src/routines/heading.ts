/**
 * FA youth heading guidance, for training:
 * - none under U12;
 * - U12 and U13: at most 5 headers per player per session;
 * - U14 and up: at most 10 per player per session;
 * - one heading session a week at most.
 * A routine is one session. Two heading drills in it count toward the same limit.
 */
export interface RoutineWarning {
  code: 'HEADING_VOLUME';
  message: string;
}

export function headingWarnings(
  drills: { category: string }[],
): RoutineWarning[] {
  const heading = drills.filter((d) => d.category === 'heading').length;
  if (heading < 2) return [];
  return [
    {
      code: 'HEADING_VOLUME',
      message:
        `This routine has ${heading} heading drills. The FA allows one heading ` +
        `session a week. Each player may head at most 5 balls per session at ` +
        `U12 to U13, and 10 at U14 and up, across all heading drills together. ` +
        `Keep one heading drill, or share the count between them.`,
    },
  ];
}
