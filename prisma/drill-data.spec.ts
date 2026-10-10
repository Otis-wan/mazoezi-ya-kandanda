import { Intensity } from '../src/generated/prisma/enums.js';
import { loadDrills, toEnum } from './drill-data.js';

describe('drill library', () => {
  const drills = loadDrills();

  it('holds all 91 drills', () => {
    // Raise this number when you add drills.
    expect(drills).toHaveLength(91);
  });

  it('gives every drill a rubric', () => {
    for (const d of drills) {
      expect(d.data.rubric).not.toHaveLength(0);
    }
  });

  it('rejects a value the enums lack', () => {
    expect(() => toEnum(Intensity, 'EXTREME', 'intensity')).toThrow(
      'Unknown intensity',
    );
  });
});