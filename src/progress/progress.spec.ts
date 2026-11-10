import { AssignmentStatus } from '../generated/prisma/enums.js';
import {
  buildProgress,
  periodStart,
  Tally,
  type ScoreRow,
} from './progress.aggregate.js';
import { resolvePeriod, workCounts } from './progress.service.js';

const row = (
  over: Partial<ScoreRow> & Pick<ScoreRow, 'score' | 'source'>,
): ScoreRow => ({
  criterion: 'Touch',
  createdAt: new Date('2026-10-14T10:00:00Z'),
  category: 'ball_mastery',
  ...over,
});

describe('periodStart', () => {
  it('starts a week on Monday', () => {
    expect(periodStart(new Date('2026-10-14T10:00:00Z'), 'week')).toBe(
      '2026-10-12',
    ); // Wed
    expect(periodStart(new Date('2026-10-12T00:00:00Z'), 'week')).toBe(
      '2026-10-12',
    ); // Mon
    expect(periodStart(new Date('2026-10-18T23:59:00Z'), 'week')).toBe(
      '2026-10-12',
    ); // Sun
  });

  it('starts a month on the first', () => {
    expect(periodStart(new Date('2026-10-31T23:00:00Z'), 'month')).toBe(
      '2026-10-01',
    );
  });
});

describe('Tally', () => {
  it('averages each source apart and rounds to two decimals', () => {
    const t = new Tally();
    t.add('COACH', 3);
    t.add('COACH', 4);
    t.add('COACH', 4);
    t.add('SELF', 5);
    expect(t.result()).toEqual({
      coachAverage: 3.67,
      selfAverage: 5,
      coachCount: 3,
      selfCount: 1,
    });
  });

  it('gives null, not zero, when there are no scores', () => {
    expect(new Tally().result()).toEqual({
      coachAverage: null,
      selfAverage: null,
      coachCount: 0,
      selfCount: 0,
    });
  });
});

describe('buildProgress', () => {
  it('returns nothing for no scores', () => {
    const p = buildProgress([], 'week');
    expect(p.categories).toEqual([]);
    expect(p.overall.coachAverage).toBeNull();
  });

  it('groups by category, lists weakest criteria first and trends by period', () => {
    const p = buildProgress(
      [
        row({ score: 2, source: 'COACH', criterion: 'Touch' }),
        row({ score: 5, source: 'COACH', criterion: 'Balance' }),
        row({ score: 4, source: 'SELF', criterion: 'Touch' }),
        row({
          score: 4,
          source: 'COACH',
          criterion: 'Touch',
          createdAt: new Date('2026-10-21T10:00:00Z'),
        }),
        row({
          score: 3,
          source: 'COACH',
          category: 'passing',
          criterion: 'Weight',
        }),
      ],
      'week',
    );
    expect(p.categories.map((c) => c.category)).toEqual([
      'ball_mastery',
      'passing',
    ]);
    const bm = p.categories[0]!;
    expect(bm.coachAverage).toBe(3.67);
    expect(bm.selfAverage).toBe(4);
    expect(bm.selfGap).toBe(0.33);
    expect(bm.criteria.map((c) => c.criterion)).toEqual(['Touch', 'Balance']);
    expect(bm.criteria[0]!.coachAverage).toBe(3);
    expect(bm.trend.map((t) => t.period)).toEqual(['2026-10-12', '2026-10-19']);
    expect(bm.trend[1]!.coachAverage).toBe(4);
    expect(p.categories[1]!.selfGap).toBeNull();
    expect(p.overall.coachCount).toBe(4);
  });
});

describe('workCounts', () => {
  it('leaves cancelled work out of the total and the rate', () => {
    const c = workCounts(
      {
        [AssignmentStatus.PENDING]: 1,
        [AssignmentStatus.SUBMITTED]: 1,
        [AssignmentStatus.REVIEWED]: 2,
        [AssignmentStatus.CANCELLED]: 5,
      },
      1,
    );
    expect(c).toMatchObject({
      total: 4,
      reviewed: 2,
      cancelled: 5,
      overdue: 1,
      completionRate: 0.75,
    });
  });

  it('does not count work that is not due yet against the rate', () => {
    const c = workCounts(
      { [AssignmentStatus.PENDING]: 3, [AssignmentStatus.REVIEWED]: 1 },
      0,
    );
    expect(c).toMatchObject({ total: 4, completionRate: 1 });
  });

  it('gives a null rate when there is no work', () => {
    expect(workCounts({}, 0).completionRate).toBeNull();
  });
});

describe('resolvePeriod', () => {
  const now = new Date('2026-10-25T12:00:00Z');

  it('defaults to the last 90 days', () => {
    const p = resolvePeriod({}, now);
    expect(p.to).toEqual(now);
    expect(now.getTime() - p.from.getTime()).toBe(90 * 86_400_000);
  });

  it('refuses a backwards or too long period', () => {
    expect(() =>
      resolvePeriod({ from: now, to: new Date('2026-10-01') }, now),
    ).toThrow();
    expect(() =>
      resolvePeriod({ from: new Date('2024-01-01'), to: now }, now),
    ).toThrow();
  });
});
