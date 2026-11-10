import { AssignmentStatus } from '../generated/prisma/enums.js';
import { isOverdue } from './assignment-codes.js';
import { checkScores, criteriaOf, ScoreInputDto } from './scores.js';

const drills = [
  {
    drill: {
      id: 'bm-001',
      rubric: [
        { criterion: 'Touch', description: 'x' },
        { criterion: 'Balance', description: 'y' },
      ],
    },
  },
  {
    drill: {
      id: 'pa-001',
      rubric: [{ criterion: 'Weight', description: 'z' }],
    },
  },
];

const score = (drillId: string, criterion: string, n = 3): ScoreInputDto =>
  Object.assign(new ScoreInputDto(), { drillId, criterion, score: n });

describe('criteriaOf', () => {
  it('lists the criterion names', () => {
    expect(criteriaOf(drills[0]!.drill.rubric)).toEqual(['Touch', 'Balance']);
  });

  it('gives an empty list for bad data', () => {
    expect(criteriaOf(null)).toEqual([]);
    expect(criteriaOf('x')).toEqual([]);
    expect(criteriaOf([null, 5, { criterion: 7 }])).toEqual([]);
  });
});

describe('checkScores', () => {
  it('accepts scores that match the routine', () => {
    const input = [score('bm-001', 'Touch'), score('pa-001', 'Weight', 5)];
    expect(checkScores(drills, input)).toEqual(input);
  });

  it('accepts an empty list', () => {
    expect(checkScores(drills, [])).toEqual([]);
  });

  it('refuses a drill that is not in the routine', () => {
    expect(() => checkScores(drills, [score('sh-001', 'Touch')])).toThrow();
  });

  it('refuses a criterion the drill does not have', () => {
    expect(() => checkScores(drills, [score('bm-001', 'Weight')])).toThrow();
  });

  it('refuses two scores for the same criterion', () => {
    expect(() =>
      checkScores(drills, [
        score('bm-001', 'Touch', 2),
        score('bm-001', 'Touch', 4),
      ]),
    ).toThrow();
  });
});

describe('isOverdue', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const past = new Date('2026-11-01T11:00:00Z');
  const future = new Date('2026-11-01T13:00:00Z');

  it('flags open work past its time', () => {
    expect(isOverdue(AssignmentStatus.PENDING, past, now)).toBe(true);
    expect(isOverdue(AssignmentStatus.IN_PROGRESS, past, now)).toBe(true);
  });

  it('does not flag work that is not late, handed in or closed', () => {
    expect(isOverdue(AssignmentStatus.PENDING, future, now)).toBe(false);
    expect(isOverdue(AssignmentStatus.SUBMITTED, past, now)).toBe(false);
    expect(isOverdue(AssignmentStatus.REVIEWED, past, now)).toBe(false);
    expect(isOverdue(AssignmentStatus.CANCELLED, past, now)).toBe(false);
  });
});
