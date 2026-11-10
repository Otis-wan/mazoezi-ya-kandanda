export type Interval = 'week' | 'month';

export interface ScoreRow {
  score: number;
  source: 'SELF' | 'COACH';
  criterion: string;
  createdAt: Date;
  category: string; // the drill's category, lower case
}

export interface Average {
  coachAverage: number | null;
  selfAverage: number | null;
  coachCount: number;
  selfCount: number;
}

/** Collects scores and reports the average of each source, to two decimals. */
export class Tally {
  private coachSum = 0;
  private selfSum = 0;
  private coachCount = 0;
  private selfCount = 0;

  add(source: 'SELF' | 'COACH', score: number): void {
    if (source === 'COACH') {
      this.coachSum += score;
      this.coachCount++;
    } else {
      this.selfSum += score;
      this.selfCount++;
    }
  }

  result(): Average {
    return {
      coachAverage: this.coachCount
        ? round2(this.coachSum / this.coachCount)
        : null,
      selfAverage: this.selfCount
        ? round2(this.selfSum / this.selfCount)
        : null,
      coachCount: this.coachCount,
      selfCount: this.selfCount,
    };
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Start of the week (Monday) or month the date falls in, as YYYY-MM-DD, in UTC. */
export function periodStart(date: Date, interval: Interval): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  if (interval === 'month') d.setUTCDate(1);
  else d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** A gap above zero means the player rates themselves higher than the coach does. */
function selfGap(a: Average): number | null {
  return a.coachAverage === null || a.selfAverage === null
    ? null
    : round2(a.selfAverage - a.coachAverage);
}

const lowFirst = (a: number | null, b: number | null) =>
  a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b;

export function buildProgress(rows: ScoreRow[], interval: Interval) {
  const overall = new Tally();
  const byCategory = new Map<
    string,
    {
      total: Tally;
      criteria: Map<string, Tally>;
      periods: Map<string, Tally>;
    }
  >();

  for (const r of rows) {
    overall.add(r.source, r.score);
    let cat = byCategory.get(r.category);
    if (!cat) {
      cat = { total: new Tally(), criteria: new Map(), periods: new Map() };
      byCategory.set(r.category, cat);
    }
    cat.total.add(r.source, r.score);
    const crit = cat.criteria.get(r.criterion) ?? new Tally();
    crit.add(r.source, r.score);
    cat.criteria.set(r.criterion, crit);
    const key = periodStart(r.createdAt, interval);
    const per = cat.periods.get(key) ?? new Tally();
    per.add(r.source, r.score);
    cat.periods.set(key, per);
  }

  const categories = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, cat]) => {
      const total = cat.total.result();
      return {
        category,
        ...total,
        selfGap: selfGap(total),
        // Weakest first, so a coach sees where to work.
        criteria: [...cat.criteria.entries()]
          .map(([criterion, t]) => ({ criterion, ...t.result() }))
          .sort(
            (a, b) =>
              lowFirst(a.coachAverage, b.coachAverage) ||
              a.criterion.localeCompare(b.criterion),
          ),
        trend: [...cat.periods.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([period, t]) => ({ period, ...t.result() })),
      };
    });

  const total = overall.result();
  return { overall: { ...total, selfGap: selfGap(total) }, categories };
}
