import { headingWarnings } from './heading.js';

describe('headingWarnings', () => {
  it('is quiet with no heading or one heading drill', () => {
    expect(headingWarnings([])).toEqual([]);
    expect(
      headingWarnings([{ category: 'passing' }, { category: 'heading' }]),
    ).toEqual([]);
  });
  it('warns on two heading drills, even the same one twice', () => {
    const w = headingWarnings([
      { category: 'heading' },
      { category: 'heading' },
    ]);
    expect(w).toHaveLength(1);
    expect(w[0]?.message).toContain('2 heading drills');
    expect(w[0]?.message).toContain('5 balls');
  });
});
