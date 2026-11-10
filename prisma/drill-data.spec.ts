import { Intensity } from '../src/generated/prisma/enums.js';
import { loadDrills, toEnum } from './drill-data.js';
import { RUBRIC_LEVELS } from './library.js';

describe('drill library', () => {
  const drills = loadDrills();

  it('holds all 111 drills', () => {
    // Raise this number when you add drills.
    expect(drills).toHaveLength(111);
  });

  it('gives every drill a rubric', () => {
    for (const d of drills) {
      expect(d.data.rubric).not.toHaveLength(0);
    }
  });

  it('gives every heading drill a safety note that names the limits', () => {
    const heading = drills.filter((d) => d.data.category === 'HEADING');
    expect(heading.length).toBeGreaterThan(0);
    for (const d of heading) {
      expect(d.data.safetyNote ?? '').toMatch(/headers per player/);
    }
  });

  it('keeps the 13-14 heading drills to unopposed technique work', () => {
    const young = drills.filter(
      (d) =>
        d.data.category === 'HEADING' && (d.data.ageBands as string[]).includes('AGE_13_14'),
    );
    expect(young.length).toBeGreaterThanOrEqual(3);
    for (const d of young) {
      expect(d.data.safetyNote ?? '').toMatch(/5 headers|no heading/i);
    }
  });

  it('covers every category in every age band the notes call for', () => {
    const has = (category: string, band: string) =>
      drills.some(
        (d) => d.data.category === category && (d.data.ageBands as string[]).includes(band),
      );
    expect(has('HEADING', 'AGE_13_14')).toBe(true);
    expect(has('SET_PIECES', 'AGE_13_14')).toBe(true);
    expect(has('GOALKEEPING', 'AGE_13_14')).toBe(true);
    expect(has('TACTICAL', 'AGE_13_14')).toBe(true);
  });

  it('writes every rubric description with 1, 3 and 5 anchors', () => {
    for (const d of drills) {
      for (const r of d.data.rubric as { criterion: string; description: string }[]) {
        expect(r.description, `${d.id}: ${r.criterion}`).toMatch(RUBRIC_LEVELS);
      }
    }
  });

  it('uses only the shared criterion names, so progress stays comparable', () => {
    // Progress groups scores by criterion name. A new name splits that history,
    // so add one on purpose: put it in this list too.
    const allowed = new Set(['application', 'awareness', 'communication', 'consistency', 'decision_making', 'effort', 'engagement', 'execution', 'intensity', 'positioning', 'reflection_quality', 'technique', 'timing']);
    for (const d of drills) {
      for (const r of d.data.rubric as { criterion: string }[]) {
        expect(allowed, `${d.id}: ${r.criterion}`).toContain(r.criterion);
      }
    }
  });

  it('rejects a value the enums lack', () => {
    expect(() => toEnum(Intensity, 'EXTREME', 'intensity')).toThrow(
      'Unknown intensity',
    );
  });
});